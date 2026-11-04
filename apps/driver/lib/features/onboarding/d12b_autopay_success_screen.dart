import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../common/go_online.dart';
import '../../router/routes.dart';
import '../../common/load_error.dart';
import '../../state/driver_account.dart';
import '../../state/driver_session.dart';
import 'widgets/signup_widgets.dart';

/// D-12b Autopay success: "You're all set!", the trial (setup) or payment (pay) status, the
/// plan summary and "Go online" → Home, already online (D-14).
class D12bAutopaySuccessScreen extends ConsumerWidget {
  const D12bAutopaySuccessScreen({super.key, this.purpose = 'setup', this.showcase = false});

  final String purpose;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final pay = purpose == 'pay';
    final planState = ref.watch(planProvider);
    if (!showcase && ref.watch(isLiveApiProvider) && planState.value == null) {
      return Scaffold(
        appBar: const TtAppBar(title: 'Your plan'),
        body: planState.hasError
            ? LoadError(
                error: planState.error!,
                what: 'your plan',
                onRetry: () => ref.invalidate(planProvider),
              )
            : const Center(child: CircularProgressIndicator()),
      );
    }
    final plan = showcase
        ? Seed.plan()
        : (ref.watch(planProvider).value ?? Seed.plan());
    final upi = showcase
        ? Seed.karthik.upiId
        : (ref.watch(driverProfileProvider).value?.upiId ??
              (ref.watch(isLiveApiProvider) ? '' : Seed.karthik.upiId));
    final daysLeft = plan.nextDebit.difference(TtClock.today).inDays;
    final price = plan.monthlyPrice == null
        ? '₹—'
        : formatInr(plan.monthlyPrice!);
    final vehicle = plan.vehicle == VehicleKind.truck
        ? 'Truck'
        : plan.vehicle.label;
    final date = formatDate(plan.nextDebit);

    Future<void> goOnline() async {
      if (showcase) return showTtSnack(context, kPreviewNote);
      await goOnlineOrExplain(context, ref, toHome: true);
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: PopScope(
        canPop: showcase,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) context.go(Routes.home);
        },
        child: Scaffold(
          backgroundColor: TtColors.surface,
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                color: TtColors.navy900,
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(TtSpacing.l, TtSpacing.xxl, TtSpacing.l, TtSpacing.xl),
                    child: Column(
                      children: [
                        Semantics(
                          image: true,
                          label: 'Success',
                          child: const DriverOrb(
                            size: 160,
                            color: TtColors.success,
                            dots: true,
                            child: Icon(Symbols.check_rounded, color: Colors.white, size: 72, weight: 600),
                          ),
                        ),
                        const SizedBox(height: TtSpacing.xl),
                        Text("You're all set!", textAlign: TextAlign.center, style: t.display.copyWith(color: Colors.white)),
                        const SizedBox(height: TtSpacing.m),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: pay ? TtColors.successTint : TtColors.coral50,
                            borderRadius: TtRadii.pillRadius,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(pay ? Symbols.check_circle_rounded : Symbols.redeem_rounded,
                                  size: 20,
                                  fill: pay ? 1 : 0,
                                  color: pay ? TtColors.successText : TtColors.coral600),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  pay ? 'Payment received. Plan active till $date' : 'Free trial active: $daysLeft days left',
                                  textAlign: TextAlign.center,
                                  style: t.bodySemibold.copyWith(color: pay ? TtColors.successText : TtColors.coral600),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(TtSpacing.l),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(TtSpacing.l),
                        decoration: BoxDecoration(
                          color: TtColors.surface,
                          borderRadius: TtRadii.cardRadius,
                          border: Border.all(color: TtColors.divider),
                        ),
                        child: Column(
                          children: [
                            _row(t, 'Plan', Text('$vehicle · $price/month', style: _v(t), textAlign: TextAlign.right)),
                            _row(t, pay ? 'Next charge' : 'First charge',
                                Text('$date · via ${plan.upiApp}', style: _v(t), textAlign: TextAlign.right)),
                            _row(t, 'Commission', const Align(alignment: Alignment.centerRight, child: CommissionBadge(large: true))),
                          ],
                        ),
                      ),
                      const SizedBox(height: TtSpacing.l),
                      Text('Riders will pay you directly by cash or UPI to $upi.',
                          style: t.bodySmall.copyWith(color: TtColors.navy700)),
                    ],
                  ),
                ),
              ),
              BottomActions(
                children: [
                  TtButton(
                    label: 'Go online',
                    icon: Symbols.power_settings_new_rounded,
                    loading: ref.watch(driverSessionProvider.select((s) => s.goingOnline)),
                    onPressed: goOnline,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  TextStyle _v(TtTextStyles t) => TtTextStyles.tabular(t.bodyMedium.copyWith(fontWeight: FontWeight.w600));

  Widget _row(TtTextStyles t, String k, Widget v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Text(k, style: t.body.copyWith(color: TtColors.navy700)),
            const SizedBox(width: TtSpacing.m),
            Expanded(child: v),
          ],
        ),
      );
}
