import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../router/routes.dart';
import '../../state/app_permissions.dart';
import 'widgets/signup_widgets.dart';

/// D-03c Permissions: after the OTP, and at start-up whenever one was turned off later (live API), every
/// [AppPermission] ride requests need. Each row is ticked once allowed; "Continue" ([next]) opens only when all are.
class D03cPermissionsScreen extends ConsumerStatefulWidget {
  const D03cPermissionsScreen({super.key, this.next = Routes.home, this.showcase = false});

  /// Where "Continue" goes: the registration page or Home.
  final String next;

  /// Opened on its own from the Design gallery: two allowed, the rest still to do; nothing is asked.
  final bool showcase;

  @override
  ConsumerState<D03cPermissionsScreen> createState() => _D03cPermissionsScreenState();
}

class _D03cPermissionsScreenState extends ConsumerState<D03cPermissionsScreen> {
  static const _showcaseMissing = [AppPermission.overlay, AppPermission.fullScreen, AppPermission.battery];

  AppLifecycleListener? _lifecycle;

  @override
  void initState() {
    super.initState();
    if (widget.showcase) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _refresh();
    });
    // Back from a settings page (Display over other apps, full-screen alerts): tick what's allowed now.
    _lifecycle = AppLifecycleListener(onResume: _refresh);
  }

  @override
  void dispose() {
    _lifecycle?.dispose();
    super.dispose();
  }

  void _refresh() => ref.read(missingPermissionsProvider.notifier).refresh();

  static (IconData, String, String) _about(AppPermission p) => switch (p) {
        AppPermission.location => (Symbols.location_on_rounded, 'Precise location', 'Find rides near you'),
        AppPermission.notifications => (
            Symbols.notifications_rounded,
            'Notifications',
            'Hear requests with the app closed',
          ),
        AppPermission.overlay => (
            Symbols.picture_in_picture_alt_rounded,
            'Display over other apps',
            'Requests pop up over other apps',
          ),
        AppPermission.fullScreen => (
            Symbols.notifications_active_rounded,
            'Full-screen alerts',
            'Requests light up a locked phone',
          ),
        AppPermission.battery => (
            Symbols.battery_saver_rounded,
            'No battery limits',
            "Requests don't pause to save battery",
          ),
      };

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final missing = widget.showcase ? _showcaseMissing : ref.watch(missingPermissionsProvider);
    const all = AppPermission.values;
    final allowed = all.length - missing.length;
    return Scaffold(
      backgroundColor: TtColors.background,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DocsHeader(
            title: 'Permissions',
            summary: '$allowed of ${all.length} allowed',
            segments: [(allowed / all.length, TtColors.success)],
            showBack: false,
            onHelp: widget.showcase ? null : () => context.push(Routes.help),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(TtSpacing.l),
              children: [
                Text(
                  'Allow all of these so ride requests reach you on time.',
                  style: t.body.copyWith(color: TtColors.navy700),
                ),
                const SizedBox(height: TtSpacing.l),
                for (final p in all) ...[
                  _PermissionRow(
                    about: _about(p),
                    allowed: !missing.contains(p),
                    onAllow: unlessShowcase(
                      context,
                      widget.showcase,
                      () => ref.read(missingPermissionsProvider.notifier).fix(p),
                    ),
                  ),
                  const SizedBox(height: TtSpacing.m),
                ],
              ],
            ),
          ),
          BottomActions(
            color: TtColors.surface,
            children: [
              if (missing.isNotEmpty) ...[
                Text(
                  'Allow all ${all.length} to continue',
                  textAlign: TextAlign.center,
                  style: t.bodySmall.copyWith(color: TtColors.navy500),
                ),
                const SizedBox(height: TtSpacing.s),
              ],
              TtButton(
                label: 'Continue',
                onPressed: missing.isEmpty
                    ? unlessShowcase(context, widget.showcase, () => context.go(widget.next))
                    : null,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One permission: icon, what it's for, and a tick once given, else the whole card asks for it.
class _PermissionRow extends StatelessWidget {
  const _PermissionRow({required this.about, required this.allowed, required this.onAllow});

  final (IconData, String, String) about;
  final bool allowed;
  final VoidCallback? onAllow;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final (icon, title, subtitle) = about;
    return Material(
      color: TtColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: TtRadii.cardRadius,
        side: BorderSide(
          color: allowed ? TtColors.success.withValues(alpha: 0.55) : TtColors.divider,
          width: allowed ? 1.5 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: allowed ? null : onAllow,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.m),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: allowed ? TtColors.successTint : TtColors.inputBg,
                  borderRadius: TtRadii.cardRadius,
                ),
                child: Icon(icon, color: allowed ? TtColors.successText : TtColors.navy700, size: 22),
              ),
              const SizedBox(width: TtSpacing.m),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: t.bodySemibold),
                    Text(subtitle, style: t.bodySmall.copyWith(color: TtColors.navy500)),
                  ],
                ),
              ),
              const SizedBox(width: TtSpacing.s),
              if (allowed)
                const Icon(
                  Symbols.check_circle_rounded,
                  fill: 1,
                  size: 32,
                  color: TtColors.success,
                  semanticLabel: 'Allowed',
                )
              else
                Container(
                  height: 36,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  alignment: Alignment.center,
                  decoration: const ShapeDecoration(color: TtColors.coral600, shape: StadiumBorder()),
                  child: Text('Allow', style: t.button.copyWith(color: Colors.white)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
