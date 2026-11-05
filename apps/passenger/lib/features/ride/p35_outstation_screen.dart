import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/map_insets.dart';
import '../../router/routes.dart';
import '../../state/nearby_vehicles.dart';
import '../../state/pricing.dart';
import '../../state/ride_flow.dart';
import 'widgets/mode_widgets.dart';

/// P-35 Outstation: a cab to another town, one way or a round trip, now or up to 7 days ahead. From → To (P-35b
/// search, other towns allowed), leave and return times, then the cab: one way by the km plus a day's driver
/// allowance; a round trip by time (both ways' km, the waiting there by the hour, the allowance per 24 hours),
/// straight back until the rider picks a return time (Red Taxi style). Tolls, parking and permits are the rider's.
/// Book now → P-12; later → P-36 booked.
class P35OutstationScreen extends ConsumerStatefulWidget {
  const P35OutstationScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<P35OutstationScreen> createState() => _P35OutstationScreenState();
}

class _P35OutstationScreenState extends ConsumerState<P35OutstationScreen> {
  /// The destination is chosen on P-35b (null until then; the ride flow's drop may still be a local one).
  Place? _to;

  @override
  void initState() {
    super.initState();
    final state = ref.read(rideFlowProvider);
    if (widget.showcase) {
      _to = Seed.outstationTowns.first;
      return;
    }
    if (state.mode?.mode == RideMode.outstation) {
      _to = state.drop;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => ref.read(rideFlowProvider.notifier).startMode(const ModeRequest(mode: RideMode.outstation)));
    }
  }

  /// "1 h 50 min away", "2 days": how long the round trip takes the cab (days of allowance from an older API).
  static String _away(OutstationTerms t) =>
      t.awayMin > 0 && t.awayMin < 1440 ? '${formatMinutes(t.awayMin)} away' : (t.days == 1 ? '1 day' : '${t.days} days');

  ModeRequest _modeOf(RideFlowState s) => s.mode?.mode == RideMode.outstation ? s.mode! : const ModeRequest(mode: RideMode.outstation);

  Future<void> _chooseDestination() async {
    final place = await context.push<Place>(Routes.outstationSearch);
    if (place == null || !mounted) return;
    setState(() => _to = place);
    final flow = ref.read(rideFlowProvider.notifier)..setDrop(place);
    flow.updateMode(_modeOf(ref.read(rideFlowProvider)));
  }

  void _setRoundTrip(bool roundTrip) {
    final flow = ref.read(rideFlowProvider.notifier);
    final m = _modeOf(ref.read(rideFlowProvider));
    if (!roundTrip) return flow.updateMode(m.copyWith(roundTrip: false, clearReturn: true));
    // No return time yet: straight back (the fare sets it to leaving + the drive both ways).
    flow.updateMode(m.copyWith(roundTrip: true));
  }

  Future<void> _book() async {
    final flow = ref.read(rideFlowProvider.notifier);
    final m = _modeOf(ref.read(rideFlowProvider));
    if (m.isLater) {
      final r = await flow.bookForLater();
      if (!mounted) return;
      if (r.error != null) return showTtSnack(context, r.error!);
      final trip = r.trip;
      if (trip == null) return;
      // Too close to its time: the search already started.
      context.go(trip.status == TripStatus.scheduled ? Routes.bookedLater : Routes.findingDriver, extra: trip.status == TripStatus.scheduled ? trip : null);
      return;
    }
    final error = await flow.book();
    if (!mounted) return;
    if (error != null) return showTtSnack(context, error);
    context.go(Routes.findingDriver);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final state = ref.watch(rideFlowProvider);
    final flow = ref.read(rideFlowProvider.notifier);
    final live = ref.watch(isLiveApiProvider) && !widget.showcase;
    final mode = _modeOf(state);
    final to = _to;
    final pricing = watchPricing(ref, state.pickup.location);
    final quotes = to == null ? null : (!live ? RideModeRates.quotesFor(state.pickup, to, mode, pricing: pricing) : state.serverQuotes);
    final selected = quotes?.where((q) => q.vehicle.kind == state.vehicle).firstOrNull ?? quotes?.firstOrNull;
    final terms = selected?.modeTerms;
    // The road to the destination (a straight-ish line until the router answers; the gallery's sample town too).
    final route = to == null
        ? const <LatLng>[]
        : (state.drop.id == to.id ? state.routeOrDefault : roadPath(state.pickup.location, to.location));

    return ModeBookingLayout(
      onBack: () => context.canPop() ? context.pop() : context.go(Routes.ride),
      map: TtMap(
        center: state.pickup.location,
        zoom: 11,
        pickup: state.pickup.location,
        drop: to?.location,
        route: route,
        fitPoints: to == null ? null : [state.pickup.location, to.location],
        fitPadding: const EdgeInsets.fromLTRB(56, 72, 56, 48),
        mapPadding: sheetMapPadding(TtSpacing.xl),
        vehicles: to == null ? nearbyMarkers(ref, state.pickup.location, kinds: RideModeRates.cabTiers) : const [],
      ),
      sections: [
        const ModeHeader(title: 'Outstation', subtitle: 'A cab to another town, one way or there and back.'),
        Padding(
          padding: const EdgeInsets.only(bottom: TtSpacing.l),
          child: TtSegmented<bool>(
            options: const [false, true],
            labelOf: (round) => round ? 'Round trip' : 'One way',
            selected: mode.roundTrip,
            onChanged: _setRoundTrip,
          ),
        ),
        ModeSection(
          title: 'Where to?',
          child: Container(
            padding: const EdgeInsets.all(TtSpacing.m),
            decoration: BoxDecoration(borderRadius: TtRadii.cardRadius, border: Border.all(color: TtColors.divider)),
            child: PickupDropConnector(
              pickupTitle: state.pickup.name,
              pickupSubtitle: state.pickup.address.isEmpty ? null : state.pickup.address,
              dropTitle: to?.name ?? 'Choose a town or city',
              dropSubtitle: to == null
                  ? 'Ooty, a wedding hall, the airport…'
                  : [if (to.address.isNotEmpty) to.address, if (terms is OutstationTerms) '${formatCount(terms.routeKm.round())} km by road'].join(' · '),
              onPickupTap: widget.showcase ? null : () => context.push('${Routes.pinOnMap}?for=pickup'),
              onDropTap: widget.showcase ? null : _chooseDestination,
            ),
          ),
        ),
        ModeSection(
          title: mode.roundTrip ? 'Leave' : 'When?',
          child: WhenChoice(
            at: mode.leaveAt,
            onChanged: (at) => flow.updateMode(at == null ? mode.copyWith(clearLeave: true) : mode.copyWith(leaveAt: at)),
          ),
        ),
        if (mode.roundTrip)
          ModeSection(
            title: 'Come back',
            trailing: terms is OutstationTerms && terms.roundTrip
                ? Text(_away(terms), style: t.bodySmallMedium.copyWith(color: TtColors.navy500))
                : null,
            child: WhenChoice(
              label: 'Return',
              allowNow: false,
              // Straight back until the rider picks a time: the fare's return (leaving + the drive both ways).
              at: mode.returnAt ?? (terms is OutstationTerms && terms.roundTrip ? terms.returnAt : null),
              note: mode.returnAt == null && terms is OutstationTerms ? 'Straight back · tap to stay longer' : null,
              after: (mode.leaveAt ?? DateTime.now())
                  .add(Duration(minutes: terms is OutstationTerms && terms.driveMin > 0 ? 2 * terms.driveMin : 120)),
              onChanged: (at) => flow.updateMode(mode.copyWith(returnAt: at)),
            ),
          ),
        ModeSection(
          title: 'Choose a cab',
          child: to == null
              ? _ChooseFirst(onTap: widget.showcase ? null : _chooseDestination)
              : ModeCabList(
                  quotes: quotes,
                  selected: state.vehicle,
                  onSelect: flow.selectVehicle,
                  error: live ? state.quotesError : null,
                  onRetry: flow.loadQuotes,
                ),
        ),
        ModeNotes(notes: [
          if (terms is OutstationTerms)
            (Symbols.badge_rounded,
                "Driver's allowance included (${formatInr(terms.allowancePerDay)} a day${terms.days > 1 ? ' × ${terms.days}' : ''})"),
          if (terms is OutstationTerms && terms.roundTrip)
            (Symbols.route_rounded, '${formatCount(terms.includedKm)} km included; more is ${formatInr(terms.perKm)} a km, added at the end'),
          if (terms is OutstationTerms && terms.roundTrip && terms.waitPerHour > 0)
            (
              Symbols.schedule_rounded,
              'Waiting there is ${formatInr(terms.waitPerHour)} an hour${terms.waitMin > 0 ? ', ${formatMinutes(terms.waitMin)} included' : ''}. '
                  "Back later than you chose? It's added at the end, the first ${RideModeRates.lateGraceMin} min free",
            ),
          (Symbols.toll_rounded, 'Tolls, parking and state permits are paid by you on the way'),
          if (mode.isLater)
            (Symbols.event_available_rounded,
                'Free to cancel until we start finding your driver, ${formatMinutes(ref.watch(dispatchLeadMinProvider))} before'),
        ]),
      ],
      bottom: TtButton(
        label: to == null
            ? 'Choose where to'
            : selected == null
                ? 'Getting fares…'
                : '${mode.isLater ? 'Schedule' : 'Book'} ${selected.vehicle.name} · ${formatInr(selected.total)}',
        loading: state.busy,
        onPressed: widget.showcase
            ? () {}
            : to == null
                ? _chooseDestination
                : selected == null
                    ? null
                    : _book,
      ),
    );
  }
}

/// "Choose where you're going to see fares."
class _ChooseFirst extends StatelessWidget {
  const _ChooseFirst({required this.onTap});
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Material(
      color: TtColors.background,
      borderRadius: TtRadii.cardRadius,
      child: InkWell(
        borderRadius: TtRadii.cardRadius,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(TtSpacing.l),
          child: Row(
            children: [
              const VehicleArt(VehicleKind.suv, width: 64, height: 40),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Text("Choose where you're going to see Mini, Sedan and SUV fares",
                    style: t.bodySmall.copyWith(color: TtColors.navy700)),
              ),
              const Icon(Symbols.chevron_right_rounded, color: TtColors.navy500),
            ],
          ),
        ),
      ),
    );
  }
}
