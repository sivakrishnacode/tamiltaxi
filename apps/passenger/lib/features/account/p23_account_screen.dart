import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/phone.dart';
import '../../common/flags.dart';
import '../../router/routes.dart';
import '../../state/session_actions.dart';
import '../../state/live_trip.dart';
import '../../state/passenger_session.dart';

/// P-23 Account: profile header with Edit, saved places, emergency contacts, safety
/// preferences, help, terms, about, the Design gallery (prototype builds) and Log out.
class P23AccountScreen extends ConsumerWidget {
  const P23AccountScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  static const version = '0.1.0';

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final ok = await showTtConfirm(
      context,
      title: 'Log out?',
      message: 'You can log in again with your phone number.',
      icon: Symbols.logout_rounded,
      confirmLabel: 'Log out',
      cancelLabel: 'Cancel',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    await signOut(ref);
    if (context.mounted) context.go(Routes.login);
  }

  /// Deletes the account after saying what goes and what stays; then the start screen.
  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final ok = await showTtConfirm(
      context,
      title: 'Delete your account?',
      message:
          'Your profile, saved places, emergency contacts and phone number are deleted, and you are logged out. '
          'Your past trips stay on record without your name or number, as the law and drivers\' earnings need. '
          'This cannot be undone.',
      icon: Symbols.person_remove_rounded,
      confirmLabel: 'Delete account',
      cancelLabel: 'Keep it',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(authRepositoryProvider).deleteAccount();
    } catch (e) {
      // 409: a trip is still on (the API says which); offline: nothing changed.
      if (context.mounted) showTtSnack(context, apiErrorMessage(e));
      return;
    }
    resetSignedInState(ref);
    if (!context.mounted) return;
    context.go(Routes.login);
    showTtSnack(context, 'Your account was deleted');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.type;
    final p = ref.watch(currentProfileProvider);
    String onOff(bool v) => v ? 'On' : 'Off';
    final places = p.savedPlaces.map((s) => s.label).join(', ');
    final contacts = p.emergencyContacts.map((c) => c.name).join(', ');
    final identity = showcase ? null : ref.watch(identityProvider).value;
    final isVerified = identity?.isApproved ?? false;

    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Material(
            color: TtColors.surface,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 24, 8, 20),
                child: Row(
                  children: [
                    TtAvatar(initials: p.initials, size: 64),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Flexible(child: Text(p.name, style: t.h1, maxLines: 1, overflow: TextOverflow.ellipsis)),
                            if (isVerified) ...[
                              const SizedBox(width: 6),
                              Semantics(
                                label: 'Verified',
                                child: const Icon(Symbols.verified_rounded, fill: 1, color: TtColors.success, size: 22),
                              ),
                            ],
                          ]),
                          Text(displayPhone(p.phone), style: TtTextStyles.tabular(t.body.copyWith(color: TtColors.navy700))),
                        ],
                      ),
                    ),
                    TextButton(onPressed: () => context.push(Routes.editProfile), child: const Text('Edit')),
                  ],
                ),
              ),
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TtListGroup(
                  children: [
                    TtListTile(
                      icon: Symbols.bookmark_rounded,
                      title: 'Saved places',
                      subtitle: places.isEmpty ? 'Add Home or Work' : places,
                      onTap: () => context.push(Routes.savedPlaces),
                    ),
                    TtListTile(
                      icon: Symbols.contact_emergency_rounded,
                      title: 'Emergency contacts',
                      subtitle: contacts.isEmpty
                          ? 'Add up to 3 people'
                          : contacts,
                      onTap: () => context.push(Routes.emergencyContacts),
                    ),
                    if (identity?.isEnabled ?? false)
                      TtListTile(
                        icon: Symbols.verified_user_rounded,
                        title: 'Verify identity',
                        subtitle: switch (identity!.status) {
                          IdentityStatus.approved => 'Verified',
                          IdentityStatus.inReview => 'Being checked',
                          IdentityStatus.declined =>
                            "Couldn't verify. Try again",
                          _ => 'Optional. Get a Verified badge',
                        },
                        onTap: () => context.push(Routes.verifyIdentity),
                      ),
                    TtListTile(
                      icon: Symbols.shield_person_rounded,
                      title: 'Safety preferences',
                      subtitle:
                          'Women driver: ${onOff(p.preferWomenDriver)} · Auto-share trips: ${onOff(p.autoShareTrips)}',
                      onTap: () => context.push(Routes.safety),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TtListGroup(
                  children: [
                    TtListTile(
                      icon: Symbols.support_agent_rounded,
                      title: 'Help & support',
                      onTap: () => context.push(Routes.help()),
                    ),
                    TtListTile(
                      icon: Symbols.gavel_rounded,
                      title: 'Terms of service',
                      onTap: () => context.push(Routes.legal('terms')),
                    ),
                    TtListTile(
                      icon: Symbols.policy_rounded,
                      title: 'Privacy policy',
                      onTap: () => context.push(Routes.legal('privacy')),
                    ),
                    TtListTile(
                      icon: Symbols.info_rounded,
                      title: 'About Tamil Taxi',
                      onTap: () => context.push(Routes.about),
                    ),
                    if (kShowDesignGallery)
                      TtListTile(
                        icon: Symbols.palette_rounded,
                        title: 'Design gallery',
                        subtitle: 'Every screen and the demo controls',
                        onTap: () => context.push(Routes.gallery),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                TtListGroup(
                  children: [
                    TtListTile(
                      icon: Symbols.logout_rounded,
                      title: 'Log out',
                      destructive: true,
                      onTap: () => _logout(context, ref),
                    ),
                    TtListTile(
                      icon: Symbols.person_remove_rounded,
                      title: 'Delete account',
                      destructive: true,
                      onTap: showcase
                          ? null
                          : () => _deleteAccount(context, ref),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  'Tamil Taxi $version · Made in Tamil Nadu',
                  style: t.bodySmall.copyWith(color: TtColors.navy500),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
