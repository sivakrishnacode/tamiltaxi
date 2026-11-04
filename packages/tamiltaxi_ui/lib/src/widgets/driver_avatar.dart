import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

import 'tt_avatar.dart';

/// A driver's approved profile photo, or their initials until there is one.
class DriverAvatar extends ConsumerWidget {
  const DriverAvatar({
    super.key,
    required this.driver,
    this.size = 48,
    this.tone = AvatarTone.navy,
    this.online = false,
    this.ringColor,
  });

  final DriverProfile driver;
  final double size;
  final AvatarTone tone;
  final bool online;
  final Color? ringColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Semantics(
        image: driver.photoPath != null,
        label: driver.photoPath != null ? 'Photo of ${driver.name}' : null,
        child: TtAvatar(
          initials: driver.initials,
          size: size,
          tone: tone,
          online: online,
          ringColor: ringColor,
          image: ref.watch(driverPhotoProvider(driver.photoPath)),
        ),
      );
}
