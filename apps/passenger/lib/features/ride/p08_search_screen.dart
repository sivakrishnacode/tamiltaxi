import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/device_location.dart';
import '../../router/routes.dart';
import '../../state/ride_flow.dart';
import '../states/s04_no_internet_screen.dart';
import 'widgets/outstation_offer_sheet.dart';

/// Id prefix of live-API search suggestions (`kApiPlacePrefix` in tamiltaxi_data, not exported).
const _suggestionPrefix = 'api:';

/// P-08 Search pickup and drop: connected pickup ("Current location, Gandhipuram") and
/// drop fields, live suggestions, "Set on map" and a disabled "Add stop" (Coming soon).
class P08SearchScreen extends ConsumerStatefulWidget {
  const P08SearchScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<P08SearchScreen> createState() => _P08SearchScreenState();
}

class _P08SearchScreenState extends ConsumerState<P08SearchScreen> {
  /// ~350 ms so Google autocomplete is not called on every keystroke.
  static const _debounce = Duration(milliseconds: 350);

  late final TextEditingController _drop = TextEditingController(text: widget.showcase ? 'Brook' : '');
  final TextEditingController _pickup = TextEditingController();
  final FocusNode _pickupFocus = FocusNode();
  final FocusNode _dropFocus = FocusNode();

  /// True while the pickup field is being edited: suggestions then set the pickup.
  bool _editingPickup = false;
  Timer? _timer;
  int _request = 0;
  bool _loading = true;
  bool _offline = false;
  List<Place> _results = const [];

  /// The text being searched (drop or pickup field).
  String _query = '';

  /// Live: the text is shorter than [kMinPlaceQuery]: the recent places stay listed, with a hint.
  bool _tooShort = false;

  /// What an empty search lists (recent drops), kept so short text doesn't ask again on every keystroke.
  List<Place>? _recents;

  bool get _live => ref.read(isLiveApiProvider);

  @override
  void initState() {
    super.initState();
    _search(_drop.text);
    _pickupFocus.addListener(() {
      if (_pickupFocus.hasFocus) {
        setState(() => _editingPickup = true);
        _pickup.clear();
        _search('');
      } else if (_editingPickup) {
        setState(() => _editingPickup = false);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _drop.dispose();
    _pickup.dispose();
    _pickupFocus.dispose();
    _dropFocus.dispose();
    super.dispose();
  }

  /// Live text under [kMinPlaceQuery] characters (but not empty): too short to search.
  bool _isShort(String q) => _live && q.trim().isNotEmpty && q.trim().length < kMinPlaceQuery;

  void _onChanged(String q) {
    _timer?.cancel();
    if (_isShort(q)) {
      // Nothing is searched yet: the recent places, then the hint.
      _search(q);
      return;
    }
    // An answer still on its way is for older text: drop it.
    _request++;
    setState(() {
      _query = q;
      _tooShort = false;
      _loading = true;
    });
    _timer = Timer(_debounce, () => _search(q));
  }

  Future<void> _search(String q) async {
    final id = ++_request;
    final short = _isShort(q);
    final cached = q.trim().isEmpty || short ? _recents : null;
    setState(() {
      _query = q;
      _tooShort = short;
      _loading = cached == null;
      _offline = false;
      if (cached != null) _results = _withoutPickup(cached);
    });
    if (cached != null) return;
    try {
      final pickup = ref.read(rideFlowProvider).pickup.location;
      // Searching the pickup itself: no distance from it. Short text lists the recents (the empty search).
      final results = await ref.read(placesRepositoryProvider).search(short ? '' : q, origin: _editingPickup ? null : pickup);
      if (!mounted || id != _request) return;
      setState(() {
        if (short || q.trim().isEmpty) _recents = results;
        _results = _withoutPickup(results);
        _loading = false;
      });
    } on OfflineException {
      if (!mounted || id != _request) return;
      setState(() {
        _offline = true;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted || id != _request) return;
      setState(() {
        _results = const [];
        _loading = false;
      });
      showTtSnack(context, e.message);
    }
  }

  /// The drop list leaves out the pickup itself.
  List<Place> _withoutPickup(List<Place> places) {
    if (_editingPickup) return places;
    final pickupId = ref.read(rideFlowProvider).pickup.id;
    return places.where((p) => p.id != pickupId).toList();
  }

  void _clear() {
    _drop.clear();
    _onChanged('');
  }

  Future<void> _choose(Place picked) async {
    // Google suggestions need their details (coordinates) first; seed places come back as is.
    final Place p;
    try {
      p = await ref.read(placesRepositoryProvider).resolve(picked);
    } on OfflineException {
      if (mounted) showTtSnack(context, "Couldn't load that place. Check your connection and try again.");
      return;
    } on ApiException catch (e) {
      if (mounted) showTtSnack(context, e.message);
      return;
    }
    if (!mounted) return;
    if (_editingPickup) {
      ref.read(rideFlowProvider.notifier).setPickup(p);
      setState(() => _editingPickup = false);
      _dropFocus.requestFocus();
      _search(_drop.text);
      return;
    }
    // A drop beyond the city (Ooty from Coimbatore): a local ride can't go there, so offer outstation instead.
    final places = ref.read(placesRepositoryProvider);
    if (places.isInServiceArea(ref.read(rideFlowProvider).pickup.location) && !await places.checkServiceArea(p.location)) {
      if (!mounted || await offerOutstation(context, ref, p) || !mounted) return;
      _dropFocus.requestFocus();
      return;
    }
    if (!mounted) return;
    ref.read(rideFlowProvider.notifier).setDrop(p);
    context.push(Routes.chooseVehicle);
  }

  Future<void> _useCurrentLocation() async {
    var here = ref.read(placesRepositoryProvider).currentLocation;
    if (here.isUnknownPickup) {
      // No fix yet: ask the phone now (and for the permission if needed).
      await ref.read(deviceLocationProvider.notifier).locate();
      if (!mounted) return;
      here = ref.read(placesRepositoryProvider).currentLocation;
      if (here.isUnknownPickup) {
        showTtSnack(context, "Couldn't find your location. Search for the pickup or set it on the map.");
        return;
      }
    }
    ref.read(rideFlowProvider.notifier).setPickup(here);
    _pickupFocus.unfocus();
    _dropFocus.requestFocus();
    showTtSnack(context, 'Pickup set to your current location');
  }

  IconData? _iconFor(Place p) => switch (p.id) {
    'brookefields' || 'prozone' => Symbols.storefront_rounded,
    'airport' => Symbols.flight_rounded,
    'junction' => Symbols.train_rounded,
    'psg-tech' => Symbols.school_rounded,
    'tidel-park' => Symbols.apartment_rounded,
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final pickup = ref.watch(rideFlowProvider.select((s) => s.pickup));
    final pickupLabel = pickup.id == Seed.gandhipuram.id
        ? 'Current location, Gandhipuram'
        : pickup.landmark != null
            ? '${pickup.name} · ${pickup.landmark}'
            : pickup.name;
    return Scaffold(
      backgroundColor: TtColors.surface,
      appBar: const TtAppBar(title: 'Plan your ride'),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.xs, TtSpacing.l, 0),
              child: _ConnectedFields(
                pickup: _PickupField(
                  label: pickupLabel,
                  controller: _pickup,
                  focusNode: _pickupFocus,
                  editing: _editingPickup,
                  onChanged: _onChanged,
                  onLocate: _useCurrentLocation,
                ),
                drop: TextField(
                  controller: _drop,
                  focusNode: _dropFocus,
                  autofocus: true,
                  onChanged: _onChanged,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) {
                    if (_results.isNotEmpty) _choose(_results.first);
                  },
                  style: t.body,
                  decoration: InputDecoration(
                    hintText: 'Where to?',
                    contentPadding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.l),
                    suffixIcon: ValueListenableBuilder(
                      valueListenable: _drop,
                      builder: (context, v, _) => v.text.isEmpty
                          ? const SizedBox.shrink()
                          : IconButton(
                              tooltip: 'Clear',
                              onPressed: _clear,
                              icon: const Icon(Symbols.cancel_rounded, color: TtColors.navy500),
                            ),
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.l, TtSpacing.l, TtSpacing.m),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _PillButton(
                      icon: Symbols.map_rounded,
                      label: _editingPickup ? 'Set pickup on map' : 'Set on map',
                      onTap: () => context.push(_editingPickup ? Routes.pinPickupOnMap : Routes.pinOnMap),
                    ),
                    const SizedBox(width: TtSpacing.s),
                    Tooltip(
                      message: 'Coming soon',
                      triggerMode: TooltipTriggerMode.tap,
                      child: Semantics(
                        enabled: false,
                        label: 'Add stop, coming soon',
                        child: const _PillButton(icon: Symbols.add_rounded, label: 'Add stop'),
                      ),
                    ),
                    const SizedBox(width: TtSpacing.s),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: TtSpacing.m, vertical: 6),
                      decoration: const BoxDecoration(color: TtColors.inputBg, borderRadius: TtRadii.pillRadius),
                      // "Soon", not "Coming soon": the longer badge ran off the edge of a 390 px phone.
                      child: Text(
                        'Soon',
                        style: t.caption.copyWith(color: TtColors.navy700, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Divider(height: 1, thickness: 1),
            Expanded(child: _resultsView()),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.m, TtSpacing.l, TtSpacing.m),
              child: Row(
                children: [
                  const Icon(Symbols.info_rounded, size: 18, color: TtColors.navy500),
                  const SizedBox(width: TtSpacing.s),
                  Expanded(
                    child: Text(
                      'Can\'t find it? Use "Set on map" to drop a pin.',
                      style: t.bodySmall.copyWith(color: TtColors.navy500),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _resultsView() {
    final t = context.type;
    if (_offline) return S04NoInternetView(onRetry: () => _search(_query));
    if (_loading) {
      return SkeletonShimmer(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.s),
          children: [
            for (var i = 0; i < 3; i++)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: TtSpacing.m),
                child: Row(
                  children: [
                    SkeletonBox(width: 40, height: 40, circle: true),
                    SizedBox(width: TtSpacing.m),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          FractionallySizedBox(widthFactor: 0.6, child: SkeletonBox(height: 12)),
                          SizedBox(height: TtSpacing.s),
                          FractionallySizedBox(widthFactor: 0.4, child: SkeletonBox(height: 10)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );
    }
    const hint = Padding(
      padding: EdgeInsets.symmetric(horizontal: TtSpacing.l),
      child: SearchMinLengthHint(),
    );
    if (_results.isEmpty) {
      if (_tooShort) return const Align(alignment: Alignment.topCenter, child: hint);
      final q = _query.trim();
      return Padding(
        padding: const EdgeInsets.all(TtSpacing.xl),
        child: Text(
          q.isEmpty ? 'Type a place, area or landmark' : 'No places found for "$q"',
          style: t.body.copyWith(color: TtColors.navy500),
          textAlign: TextAlign.center,
        ),
      );
    }
    final pickup = ref.read(rideFlowProvider).pickup;
    final lead = _tooShort ? 1 : 0;
    return ListView.separated(
      padding: EdgeInsets.zero,
      itemCount: _results.length + lead,
      separatorBuilder: (_, i) => i < lead ? const SizedBox.shrink() : const Divider(height: 1, indent: 68),
      itemBuilder: (context, index) {
        if (index < lead) return hint;
        final p = _results[index - lead];
        final icon = _iconFor(p);
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l),
          child: LocationRow(
            kind: icon == Symbols.storefront_rounded ? LocationRowKind.landmark : LocationRowKind.search,
            icon: icon,
            title: p.name,
            subtitle: p.address,
            // Search suggestions only get coordinates when picked (Place Details): the server's road distance from
            // the pickup (Places `distanceMeters`) when it sent one.
            trailingText: p.id.startsWith(_suggestionPrefix)
                ? (p.distanceKm == null ? null : formatKm(p.distanceKm!))
                : formatKm(FareEngine.estimate(pickup, p).distanceKm),
            onTap: () => _choose(p),
          ),
        );
      },
    );
  }
}

/// Dot → dotted line → pin on the left, the two fields on the right.
class _ConnectedFields extends StatelessWidget {
  const _ConnectedFields({required this.pickup, required this.drop});
  final Widget pickup;
  final Widget drop;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      const SizedBox(
        width: 32,
        child: Column(
          children: [
            PickupDot(size: 12),
            SizedBox(height: TtSpacing.xs),
            _Dots(),
            SizedBox(height: TtSpacing.m),
            DropPin(size: 22),
          ],
        ),
      ),
      const SizedBox(width: TtSpacing.s),
      Expanded(
        child: Column(
          children: [
            pickup,
            const SizedBox(height: TtSpacing.m),
            drop,
          ],
        ),
      ),
    ],
  );
}

class _Dots extends StatelessWidget {
  const _Dots();

  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (var i = 0; i < 6; i++)
        Container(width: 2, height: 3, margin: const EdgeInsets.symmetric(vertical: 1.5), color: TtColors.navy500),
    ],
  );
}

/// Pickup field: shows the chosen pickup; tap to search for another one.
class _PickupField extends StatelessWidget {
  const _PickupField({
    required this.label,
    required this.controller,
    required this.focusNode,
    required this.editing,
    required this.onChanged,
    required this.onLocate,
  });
  final String label;
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool editing;
  final ValueChanged<String> onChanged;
  final VoidCallback onLocate;

  @override
  Widget build(BuildContext context) => TextField(
    key: const ValueKey('pickup-field'),
    controller: controller,
    focusNode: focusNode,
    onChanged: onChanged,
    textInputAction: TextInputAction.search,
    style: context.type.body,
    decoration: InputDecoration(
      // When not editing, the current pickup shows as the hint (reads like a value).
      hintText: editing ? 'Search pickup location' : label,
      hintStyle: context.type.body.copyWith(color: editing ? TtColors.navy500 : TtColors.navy900),
      contentPadding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.l),
      suffixIcon: IconButton(
        tooltip: 'Use current location',
        onPressed: onLocate,
        icon: const Icon(Symbols.my_location_rounded, color: TtColors.navy500),
      ),
    ),
  );
}

/// Outlined pill ("Set on map"). Disabled look when [onTap] is null.
class _PillButton extends StatelessWidget {
  const _PillButton({required this.icon, required this.label, this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final fg = enabled ? TtColors.navy900 : TtColors.navy300;
    return Material(
      color: TtColors.surface,
      shape: StadiumBorder(side: BorderSide(color: enabled ? TtColors.divider : TtColors.inputBg)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 20, color: enabled ? TtColors.coral600 : TtColors.navy300),
              const SizedBox(width: TtSpacing.s),
              Text(label, style: context.type.bodySemibold.copyWith(color: fg)),
            ],
          ),
        ),
      ),
    );
  }
}
