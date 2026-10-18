import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import 'live_trip.dart';
import 'passenger_session.dart';
import 'pricing.dart';
import 'ride_flow.dart' show upcomingTripsProvider;

/// The move's pickup isn't known yet (no location): the price waits for it.
const kChooseMovePickup = 'Choose where you are moving from';

const Object _keep = Object();

/// A house shift being planned (PH-01 … PH-04): where from and to, the home and its items, the day and slot, the
/// vehicle and extras, and the price for all of it.
@immutable
class ShiftingFlowState {
  const ShiftingFlowState({
    required this.pickup,
    this.drop,
    this.details = const ShiftingDetails(),
    this.vehicle,
    required this.day,
    this.slotHour = 9,
    this.quote,
    this.quoteError,
    this.busy = false,
    this.pricing = ModePricing.defaults,
  });

  /// The sample plan the Design gallery shows (a 1 BHK from Peelamedu to Race Course, three items typed).
  factory ShiftingFlowState.sample({DateTime? now}) {
    final today = now ?? DateTime.now();
    const details = ShiftingDetails(
      homeSize: HomeSize.oneBhk,
      items: [
        ShiftingItem(name: 'Double cot', note: 'Wooden, comes apart'),
        ShiftingItem(name: 'Fridge', note: 'Single door'),
        ShiftingItem(name: '3-seater sofa'),
        ShiftingItem(name: 'Cartons', qty: 12, note: 'Kitchen things and books'),
        ShiftingItem(name: 'Washing machine', note: 'Top load'),
      ],
      pickupFloor: 2,
      dropFloor: 5,
      dropLift: true,
      packing: PackingLevel.basic,
      dismantlePieces: 1,
    );
    final day = DateTime(today.year, today.month, today.day + 2);
    final slot = DateTime(day.year, day.month, day.day, 9);
    return ShiftingFlowState(
      pickup: Seed.peelamedu,
      drop: Seed.raceCourse,
      details: details,
      day: day,
      quote: GoodsModeRates.quote(Seed.peelamedu, Seed.raceCourse, details, at: slot, now: today),
    );
  }

  final Place pickup;

  /// Null until the rider chooses where to (PH-01).
  final Place? drop;
  final ShiftingDetails details;

  /// The vehicle chosen on PH-03; null = the one suggested for the home size.
  final VehicleKind? vehicle;

  /// The calendar day of the move (midnight).
  final DateTime day;

  /// Start hour of the two-hour slot ([GoodsModeRates.slotHours]).
  final int slotHour;
  final ShiftingQuote? quote;
  final String? quoteError;
  final bool busy;

  /// The pickup city's prices (helpers, packing, extras shown before the quote); built-in until they load.
  final ModePricing pricing;

  DateTime get slot => DateTime(day.year, day.month, day.day, slotHour);
  VehicleKind get vehicleOrSuggested => vehicle ?? pricing.shifting.size(details.homeSize).vehicle;
  bool get placesReady => drop != null;

  ShiftingFlowState copyWith({
    Place? pickup,
    Object? drop = _keep,
    ShiftingDetails? details,
    Object? vehicle = _keep,
    DateTime? day,
    int? slotHour,
    Object? quote = _keep,
    Object? quoteError = _keep,
    bool? busy,
    ModePricing? pricing,
  }) =>
      ShiftingFlowState(
        pickup: pickup ?? this.pickup,
        drop: identical(drop, _keep) ? this.drop : drop as Place?,
        details: details ?? this.details,
        vehicle: identical(vehicle, _keep) ? this.vehicle : vehicle as VehicleKind?,
        day: day ?? this.day,
        slotHour: slotHour ?? this.slotHour,
        quote: identical(quote, _keep) ? this.quote : quote as ShiftingQuote?,
        quoteError: identical(quoteError, _keep) ? this.quoteError : quoteError as String?,
        busy: busy ?? this.busy,
        pricing: pricing ?? this.pricing,
      );
}

/// "7–9 AM", "11 AM–1 PM", "4–6 PM".
String slotLabel(int startHour) => slotRangeLabel(startHour);

/// Plans and books a house shift. Every change that moves the price asks for a new quote (mock: priced here like the
/// API; live: `POST /fares/shifting-quote`, the latest answer wins).
class ShiftingFlowController extends Notifier<ShiftingFlowState> {
  Timer? _debounce;
  int _request = 0;

  /// The rider chose the pickup: the phone's location no longer replaces it.
  bool _pickupChosen = false;

  bool get _live => ref.read(isLiveApiProvider);

  @override
  ShiftingFlowState build() {
    ref.onDispose(() => _debounce?.cancel());
    final now = DateTime.now();
    final pickup = _live ? ref.read(placesRepositoryProvider).currentLocation : Seed.peelamedu;
    Future.microtask(() => _loadPricing(pickup.location));
    return ShiftingFlowState(pickup: pickup, day: _firstDay(now), slotHour: _firstSlot(_firstDay(now), now));
  }

  /// The pickup city's prices, then a fresh quote with them.
  Future<void> _loadPricing(LatLng at) async {
    final pricing = await ref.read(modePricingProvider(pricingKey(at)).future);
    if (!ref.mounted || pricingKey(state.pickup.location) != pricingKey(at)) return;
    state = state.copyWith(pricing: pricing);
    _requote();
  }

  /// Tomorrow: a move is usually planned a day ahead (today's open slots can still be chosen on PH-03).
  static DateTime _firstDay(DateTime now) => DateTime(now.year, now.month, now.day + 1);

  /// The slots on [day] that start at least [GoodsModeRates.leadTime] after [now].
  static List<int> slotsOpen(DateTime day, DateTime now) => [
        for (final h in GoodsModeRates.slotHours)
          if (DateTime(day.year, day.month, day.day, h).isAfter(now.add(GoodsModeRates.leadTime))) h,
      ];

  static int _firstSlot(DateTime day, DateTime now) {
    final open = slotsOpen(day, now);
    return open.contains(9) ? 9 : (open.isEmpty ? 9 : open.first);
  }

  void _set(ShiftingFlowState next, {bool requote = true}) {
    state = next;
    if (requote) _requote();
  }

  void setBetween(bool v) => _set(state.copyWith(details: state.details.copyWith(between: v)));
  void setPickup(Place p) {
    _pickupChosen = true;
    _setPickup(p);
  }

  /// The phone's location: the pickup while the rider hasn't chosen one.
  void useDeviceLocation(Place p) {
    if (_pickupChosen || state.busy) return;
    _setPickup(p);
  }

  void _setPickup(Place p) {
    _set(state.copyWith(pickup: p));
    unawaited(_loadPricing(p.location));
  }
  void setDrop(Place p) => _set(state.copyWith(drop: p));

  /// One end's floor and whether a lift takes the furniture (PH-01: Ground floor, Lift or No lift, then the floor).
  void setLevel({required bool pickup, required int floor, required bool lift}) {
    final f = floor.clamp(0, GoodsModeRates.maxFloor);
    final d = state.details;
    _set(state.copyWith(
      details: pickup ? d.copyWith(pickupFloor: f, pickupLift: lift) : d.copyWith(dropFloor: f, dropLift: lift),
    ));
  }

  /// A new home size suggests its own vehicle again.
  void setHomeSize(HomeSize size) => _set(state.copyWith(details: state.details.copyWith(homeSize: size), vehicle: null));

  /// Items as typed on PH-02 (one line, or "Paste a list"); stops at [GoodsModeRates.maxItems].
  void addItems(List<ShiftingItem> items) {
    final room = GoodsModeRates.maxItems - state.details.items.length;
    final add = [for (final i in items.where((i) => i.name.trim().isNotEmpty).take(room < 0 ? 0 : room)) _clean(i)];
    if (add.isEmpty) return;
    _set(state.copyWith(details: state.details.copyWith(items: [...state.details.items, ...add])), requote: false);
  }

  void updateItem(int index, ShiftingItem item) {
    final items = [...state.details.items];
    if (index < 0 || index >= items.length || item.name.trim().isEmpty) return;
    items[index] = _clean(item);
    _set(state.copyWith(details: state.details.copyWith(items: items)), requote: false);
  }

  void removeItem(int index) {
    final items = [...state.details.items];
    if (index < 0 || index >= items.length) return;
    items.removeAt(index);
    _set(state.copyWith(details: state.details.copyWith(items: items)), requote: false);
  }

  static ShiftingItem _clean(ShiftingItem i) =>
      ShiftingItem(name: i.name.trim(), qty: i.qty.clamp(1, 50), note: i.note.trim());

  /// A new day keeps the slot if it is still open, else the first open one.
  void setDay(DateTime day) {
    final d = DateTime(day.year, day.month, day.day);
    final open = slotsOpen(d, DateTime.now());
    _set(state.copyWith(day: d, slotHour: open.contains(state.slotHour) ? state.slotHour : (open.isEmpty ? state.slotHour : open.first)));
  }

  void setSlot(int hour) => _set(state.copyWith(slotHour: hour));
  void setVehicle(VehicleKind v) => _set(state.copyWith(vehicle: v));
  void setPacking(PackingLevel p) => _set(state.copyWith(details: state.details.copyWith(packing: p)));

  void setDismantle(int pieces) =>
      _set(state.copyWith(details: state.details.copyWith(dismantlePieces: pieces.clamp(0, GoodsModeRates.maxDismantlePieces))));

  void setUnpack(bool v) => _set(state.copyWith(details: state.details.copyWith(unpack: v)));

  void setExtraHelpers(int n) =>
      _set(state.copyWith(details: state.details.copyWith(extraHelpers: n.clamp(0, GoodsModeRates.maxExtraHelpers))));

  /// Prices the plan again (needs a drop). Mock: at once; live: 250 ms after the last change.
  void _requote() {
    final drop = state.drop;
    if (drop == null) return;
    if (state.pickup.isUnknownPickup) {
      state = state.copyWith(quote: null, quoteError: kChooseMovePickup);
      return;
    }
    if (!_live) {
      state = state.copyWith(
        quote: GoodsModeRates.quote(state.pickup, drop, state.details, vehicle: state.vehicle, at: state.slot, pricing: state.pricing),
        quoteError: null,
      );
      return;
    }
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () => unawaited(refreshQuote()));
  }

  /// Live API: fetches the price for the plan now. Mock: same as any change.
  Future<void> refreshQuote() async {
    final drop = state.drop;
    if (drop == null) return;
    if (!_live || state.pickup.isUnknownPickup) return _requote();
    final id = ++_request;
    state = state.copyWith(quoteError: null);
    try {
      final q = await ref
          .read(parcelRepositoryProvider)
          .shiftingQuote(state.pickup, drop, state.details, vehicle: state.vehicle, at: state.slot);
      if (ref.mounted && id == _request) state = state.copyWith(quote: q, quoteError: null);
    } catch (e) {
      if (ref.mounted && id == _request) state = state.copyWith(quoteError: apiErrorMessage(e));
    }
  }

  /// Books the move for its slot: it waits as scheduled (Activity › Upcoming) and the plan resets (the pickup stays).
  /// Returns the booked trip for P-36, or a user-facing error.
  Future<({String? error, Trip? trip})> book() async {
    final drop = state.drop;
    final q = state.quote;
    if (state.pickup.isUnknownPickup) return (error: kChooseMovePickup, trip: null);
    if (drop == null) return (error: 'Choose where you are moving to', trip: null);
    if (state.details.items.isEmpty) return (error: 'Add the things you are moving', trip: null);
    if (q == null) return (error: 'Getting the price…', trip: null);
    if (!state.slot.isAfter(DateTime.now().add(GoodsModeRates.leadTime - const Duration(minutes: 1)))) {
      return (error: 'Choose a slot at least an hour from now', trip: null);
    }
    if (state.busy) return (error: null, trip: null);
    state = state.copyWith(busy: true);
    final me = ref.read(passengerProfileProvider).value;
    final name = me?.name.trim().isNotEmpty == true ? me!.name : 'Tamil Taxi customer';
    final phone = me?.phone ?? '';
    // The rider is at both ends: they get the delivery OTP for the movers at the new home.
    final parcel = ParcelDetails(
      category: ParcelCategory.household,
      weight: WeightBand.over500,
      senderName: name,
      senderPhone: phone,
      receiverName: name,
      receiverPhone: phone,
    );
    try {
      Trip trip;
      if (_live) {
        final update = await ref.read(liveTripsProvider).book(
              kind: TripKind.parcel,
              vehicle: q.vehicle,
              pickup: state.pickup,
              drop: drop,
              parcel: parcel,
              shifting: state.details,
              slot: state.slot,
            );
        trip = update.trip;
      } else {
        trip = Trip(
          id: 'HS-${DateTime.now().millisecondsSinceEpoch % 10000000}',
          kind: TripKind.parcel,
          vehicle: q.vehicle,
          pickup: state.pickup,
          drop: drop,
          fare: q.lines.total,
          status: TripStatus.scheduled,
          startedAt: DateTime.now(),
          distanceKm: q.distanceKm,
          durationMin: q.durationMin,
          parcel: parcel,
          rideMode: state.details.between ? RideMode.outstation : RideMode.local,
          modeTerms: q.modeTerms,
          scheduledAt: state.slot,
          shifting: state.details.copyWith(lines: q.lines),
        );
        ref.read(mockDatabaseProvider).upcoming.add(trip);
      }
      if (!ref.mounted) return (error: null, trip: trip);
      final now = DateTime.now();
      state = ShiftingFlowState(
        pickup: state.pickup,
        day: _firstDay(now),
        slotHour: _firstSlot(_firstDay(now), now),
        pricing: state.pricing,
      );
      ref.invalidate(upcomingTripsProvider);
      return (error: null, trip: trip);
    } catch (e) {
      if (ref.mounted) state = state.copyWith(busy: false);
      return (error: apiErrorMessage(e), trip: null);
    }
  }
}

final shiftingFlowProvider = NotifierProvider<ShiftingFlowController, ShiftingFlowState>(ShiftingFlowController.new);

/// "Paste a list": one item per line. A leading or trailing count ("2 chairs", "Chairs x2", "chairs - 2") sets the
/// quantity; anything after " - ", " – " or ":" (that isn't a count) is the note. Blank lines and bullets are ignored.
List<ShiftingItem> parseItemList(String text) {
  final out = <ShiftingItem>[];
  for (final raw in text.split(RegExp(r'[\n;]'))) {
    var line = raw.trim().replaceFirst(RegExp(r'^(?:[-*•·]|\d{1,2}[.)])\s+'), '').trim();
    if (line.isEmpty) continue;
    var qty = 1;
    var note = '';
    final sep = RegExp(r'\s+[-–:]\s+|:\s*').firstMatch(line);
    if (sep != null) {
      final tail = line.substring(sep.end).trim();
      final tailCount = RegExp(r'^[x×]?\s*(\d{1,2})$', caseSensitive: false).firstMatch(tail);
      if (tailCount != null) {
        qty = int.parse(tailCount.group(1)!);
      } else {
        note = tail;
      }
      line = line.substring(0, sep.start).trim();
    }
    final lead = RegExp(r'^(\d{1,2})\s*[x×]?\s+(.+)$', caseSensitive: false).firstMatch(line);
    final trail = RegExp(r'^(.+?)\s*[x×]\s*(\d{1,2})$', caseSensitive: false).firstMatch(line);
    if (lead != null) {
      qty = int.parse(lead.group(1)!);
      line = lead.group(2)!.trim();
    } else if (trail != null) {
      qty = int.parse(trail.group(2)!);
      line = trail.group(1)!.trim();
    }
    if (line.isEmpty) continue;
    out.add(ShiftingItem(name: line.length > 60 ? line.substring(0, 60) : line, qty: qty.clamp(1, 50), note: note.length > 120 ? note.substring(0, 120) : note));
  }
  return out;
}
