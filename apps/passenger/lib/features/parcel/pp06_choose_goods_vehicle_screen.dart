import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/map_insets.dart';
import '../../router/routes.dart';
import '../../state/parcel_flow.dart';
import '../../state/ride_flow.dart' show kChoosePickupForFares;
import '../ride/widgets/mode_widgets.dart' show WhenChoice;
import 'pp05_prohibited_items_sheet.dart';
import 'widgets/parcel_widgets.dart';

/// PP-06 Choose goods vehicle and book: route map, goods vehicles filtered by weight (with their load bed), "What
/// are you sending?" (optional, PP-04), who pays, fare breakdown, the prohibited-items note and Book. To another town: the goods trucks by the km, one way, now or later (Schedule → P-36).
class PP06ChooseGoodsVehicleScreen extends ConsumerStatefulWidget {
  const PP06ChooseGoodsVehicleScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<PP06ChooseGoodsVehicleScreen> createState() => _PP06ChooseGoodsVehicleScreenState();
}

class _PP06ChooseGoodsVehicleScreenState extends ConsumerState<PP06ChooseGoodsVehicleScreen> {
  @override
  void initState() {
    super.initState();
    // Live API: the fares shown and booked are the server's goods quotes.
    if (!widget.showcase) Future.microtask(() => ref.read(parcelFlowProvider.notifier).loadQuotes());
  }

  Future<void> _book() async {
    final flow = ref.read(parcelFlowProvider.notifier);
    if (ref.read(parcelFlowProvider).leaveAt != null) {
      final r = await flow.bookForLater();
      if (!mounted) return;
      if (r.error != null) return showTtSnack(context, r.error!);
      final trip = r.trip;
      if (trip == null) return;
      // Too close to its time: the search already started.
      context.go(trip.status == TripStatus.scheduled ? Routes.parcelBooked : Routes.parcelFinding, extra: trip.status == TripStatus.scheduled ? trip : null);
      return;
    }
    final error = await flow.book();
    if (!mounted) return;
    if (error != null) {
      showTtSnack(context, error);
      return;
    }
    context.go(Routes.parcelFinding);
  }

  void _showFare(BuildContext context, FareQuote q) {
    showTtSheet<void>(
      context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FareBreakdown.fromQuote(q, title: 'Fare breakdown', subtitle: '${q.vehicle.name} · ${formatKm(q.distanceKm)}'),
          const SizedBox(height: 8),
          Text('Pay the driver directly by cash or UPI when the job is done.',
              style: ctx.type.caption.copyWith(color: TtColors.navy500)),
          const SizedBox(height: 16),
          TtButton(label: 'Got it', onPressed: () => Navigator.of(ctx).pop()),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final s = ref.watch(parcelFlowProvider);
    final ctrl = ref.read(parcelFlowProvider.notifier);
    // Live API: wait for the server's quotes; never show a locally computed fare.
    final quotesReady = widget.showcase || !ref.watch(isLiveApiProvider) || s.serverQuotes != null;
    final quotes = s.quotes;
    final quote = s.quote;
    final canBook = quotesReady && s.fits(quote.vehicle) && !s.busy;
    final height = MediaQuery.sizeOf(context).height;
    final top = MediaQuery.paddingOf(context).top;
    final insets = sheetMapInsets(EdgeInsets.fromLTRB(56, top + 96, 56, height * 0.64 + 24), height * 0.64);

    return Scaffold(
      backgroundColor: TtColors.surface,
      body: Stack(
        children: [
          Positioned.fill(
            child: TtMap(
              pickup: s.pickup.location,
              drop: s.drop.location,
              route: s.routeOrDefault,
              fitPoints: s.routeOrDefault,
              fitPadding: insets.fit,
              mapPadding: insets.map,
              // Between the back button and the distance chip, below the status bar.
              attributionAlignment: Alignment.topCenter,
              attributionPadding: EdgeInsets.only(top: top),
            ),
          ),
          Positioned(
            top: top + 12,
            left: 16,
            child: MapCircleButton(
              icon: Symbols.arrow_back_rounded,
              tooltip: 'Back',
              onPressed: () => context.canPop() ? context.pop() : context.go(Routes.parcel),
            ),
          ),
          Positioned(
            top: top + 16,
            right: 16,
            child: _RouteChip(label: quotesReady ? s.estimate.label : 'Getting fares…'),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: ParcelSheetPanel(
              maxHeight: height * 0.66,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('Choose a vehicle', style: t.bodySemibold, maxLines: 1, overflow: TextOverflow.ellipsis),
                          if (s.outstation) ...[
                            const SizedBox(height: 2),
                            Text(
                              'To ${s.drop.name} · one way',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: t.bodySmall.copyWith(color: TtColors.navy500),
                            ),
                          ],
                          const SizedBox(height: TtSpacing.s),
                          if (!quotesReady)
                            s.pickup.isUnknownPickup
                                ? _QuotesPending(
                                    error: kChoosePickupForFares,
                                    actionLabel: 'Choose pickup',
                                    onRetry: () => context.push(Routes.parcelPickup),
                                  )
                                : _QuotesPending(error: s.quotesError, onRetry: ctrl.loadQuotes)
                          else
                          for (final q in quotes) ...[
                            VehicleOptionCard(
                              icon: q.vehicle.kind.icon,
                              // The vehicle's render (every goods vehicle has one); the symbol tile for one without.
                              art: q.vehicle.kind.artAsset != null ? VehicleArt(q.vehicle.kind) : null,
                              name: q.vehicle.name,
                              subtitle: _subtitle(q, s.outstation),
                              fare: q.total,
                              badge: q.vehicle.badge,
                              selected: q.vehicle.kind == s.vehicle,
                              disabledReason: s.fits(q.vehicle) ? null : 'Too small for ${s.details.weight.label}',
                              onTap: () => ctrl.selectVehicle(q.vehicle.kind),
                            ),
                            const SizedBox(height: TtSpacing.xs),
                          ],
                          _DetailsRow(
                            details: s.details,
                            set: s.detailsSet,
                            onTap: () => context.push(Routes.parcelDetails),
                          ),
                          const SizedBox(height: 16),
                          if (s.outstation) ...[
                            Text('When?', style: t.bodyMedium),
                            const SizedBox(height: 10),
                            WhenChoice(at: s.leaveAt, onChanged: widget.showcase ? (_) {} : ctrl.setLeaveAt),
                            const SizedBox(height: 16),
                          ],
                          Text('Who pays the driver?', style: t.bodyMedium),
                          const SizedBox(height: 10),
                          TtSegmented<ParcelPayer>(
                            options: ParcelPayer.values,
                            labelOf: (p) => p == ParcelPayer.sender ? 'Sender (me)' : 'Receiver',
                            selected: s.details.payer,
                            onChanged: ctrl.setPayer,
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              const Icon(Symbols.back_hand_rounded, size: 20, color: TtColors.navy700),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text('Loading and unloading is done by the sender and receiver.',
                                    style: t.bodySmall.copyWith(color: TtColors.navy700)),
                              ),
                              TextButton(
                                onPressed: quotesReady ? () => _showFare(context, quote) : null,
                                style: TextButton.styleFrom(
                                  foregroundColor: TtColors.coral600,
                                  minimumSize: const Size(48, 48),
                                  padding: const EdgeInsets.symmetric(horizontal: 8),
                                  textStyle: t.bodyMedium.copyWith(fontWeight: FontWeight.w600),
                                ),
                                child: const Text('Fare breakdown'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          if (s.outstation) ...[
                            Text(
                              'One way: the price includes the drive back. Tolls and state permits on the way are yours.',
                              style: t.caption.copyWith(color: TtColors.navy500),
                            ),
                            const SizedBox(height: 4),
                          ],
                          Text(
                            'Tamil Taxi connects you with drivers and is not liable for lost or damaged goods.',
                            style: t.caption.copyWith(color: TtColors.navy500),
                          ),
                        ],
                      ),
                    ),
                  ),
                  _ProhibitedNote(onSeeList: () => PP05ProhibitedItemsSheet.show(context)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: TtButton(
                      label: quotesReady
                          ? '${s.leaveAt != null ? 'Schedule' : 'Book'} ${quote.vehicle.name} · ${formatInr(quote.total)}'
                          : 'Book',
                      loading: s.busy,
                      onPressed: canBook ? _book : null,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "6 min · Up to 750 kg"; to another town "₹26/km · 104 km · Up to 750 kg". Goods go by weight only.
String _subtitle(FareQuote q, bool outstation) {
  final v = q.vehicle;
  final terms = q.modeTerms;
  if (outstation && terms is OutstationTerms) {
    return ['₹${terms.perKm.round()}/km · ${formatCount(terms.includedKm)} km', v.capacityLabel].join(' · ');
  }
  return ['${v.etaMin} min', v.capacityLabel].join(' · ');
}

/// "What are you sending?": optional. Until it is filled in, the parcel goes as "Other · Under 5 kg".
class _DetailsRow extends StatelessWidget {
  const _DetailsRow({required this.details, required this.set, required this.onTap});
  final ParcelDetails details;
  final bool set;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return TtCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      child: Semantics(
        button: true,
        label: set ? 'Parcel: ${details.category.label}, ${details.weight.label}. Edit' : 'What are you sending? Optional. Add',
        excludeSemantics: true,
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(color: TtColors.coral50, borderRadius: TtRadii.cardRadius),
              child: Icon(set ? parcelCategoryIcon(details.category) : Symbols.inventory_2_rounded, color: TtColors.coral600, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    set ? '${details.category.label} · ${details.weight.label}' : 'What are you sending?',
                    style: t.bodyMedium.copyWith(fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    set ? 'Parcel details' : 'Optional · type, weight, photo',
                    style: t.bodySmall.copyWith(color: TtColors.navy500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(set ? 'Edit' : 'Add', style: t.bodyMedium.copyWith(color: TtColors.coral600, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}

/// "By booking, you confirm no prohibited items · See list" just above Book.
class _ProhibitedNote extends StatelessWidget {
  const _ProhibitedNote({required this.onSeeList});
  final VoidCallback onSeeList;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 8, 0),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'By booking, you confirm no prohibited items.',
              style: t.caption.copyWith(color: TtColors.navy700),
            ),
          ),
          TextButton(
            onPressed: onSeeList,
            style: TextButton.styleFrom(
              foregroundColor: TtColors.coral600,
              minimumSize: const Size(48, 40),
              padding: const EdgeInsets.symmetric(horizontal: 8),
              textStyle: t.caption.copyWith(fontWeight: FontWeight.w600),
            ),
            child: const Text('See list'),
          ),
        ],
      ),
    );
  }
}

class _RouteChip extends StatelessWidget {
  const _RouteChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: const BoxDecoration(color: TtColors.surface, borderRadius: TtRadii.pillRadius, boxShadow: TtShadows.soft),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Symbols.route_rounded, size: 18, color: TtColors.coral600),
            const SizedBox(width: 6),
            Text(label, style: TtTextStyles.tabular(context.type.bodySmallMedium.copyWith(color: TtColors.navy900))),
          ],
        ),
      );
}

/// Live API: goods fares are loading, or failed with [error] and a Retry.
class _QuotesPending extends StatelessWidget {
  const _QuotesPending({required this.error, required this.onRetry, this.actionLabel = 'Try again'});
  final String? error;
  final VoidCallback onRetry;
  final String actionLabel;

  @override
  Widget build(BuildContext context) {
    final message = error;
    if (message == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        children: [
          Text(message, style: context.type.body.copyWith(color: TtColors.navy700), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          TtButton.text(label: actionLabel, onPressed: onRetry),
        ],
      ),
    );
  }
}
