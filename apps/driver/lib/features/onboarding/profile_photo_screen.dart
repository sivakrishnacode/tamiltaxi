import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../state/driver_account.dart';
import '../../state/live_helpers.dart';
import 'widgets/signup_widgets.dart';

/// Profile photo riders see (Account › Documents). Tips → front camera → a preview of the rider's driver card
/// ("How riders will see you") with Retake / Use this photo. Nothing is sent until the driver confirms; an admin
/// then approves it (Drivers › Approvals › Photos) and the current photo stays until then.
class ProfilePhotoScreen extends ConsumerStatefulWidget {
  const ProfilePhotoScreen({super.key});

  @override
  ConsumerState<ProfilePhotoScreen> createState() => _ProfilePhotoScreenState();
}

class _ProfilePhotoScreenState extends ConsumerState<ProfilePhotoScreen> {
  Uint8List? _bytes;
  String _name = 'photo.jpg';
  bool _saving = false;
  String? _error;

  Future<void> _take() async {
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
        maxWidth: 1080,
        maxHeight: 1080,
        imageQuality: 85,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      setState(() {
        _bytes = bytes;
        _name = file.name.isEmpty ? 'photo.jpg' : file.name;
        _error = null;
      });
    } catch (_) {
      if (mounted) showTtSnack(context, 'Allow camera access to take your photo');
    }
  }

  Future<void> _use() async {
    final bytes = _bytes;
    if (bytes == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      final isLive = await ref.read(driverRepositoryProvider).uploadProfilePhoto(bytes, _name);
      container.invalidate(driverProfileProvider);
      if (!mounted) return;
      showTtSnack(context, isLive ? 'Photo added. Riders will see it on their trip' : "Thanks! We're checking your photo");
      context.pop();
    } on Exception catch (e) {
      if (mounted) setState(() => _error = userMessage(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final profile = ref.watch(driverProfileProvider).value ?? Seed.karthik;
    final bytes = _bytes;
    return Scaffold(
      backgroundColor: TtColors.background,
      appBar: const TtAppBar(title: 'Profile photo'),
      body: ListView(
        padding: const EdgeInsets.all(TtSpacing.l),
        children: [
          if (bytes == null) ...[
            Center(child: DriverAvatar(driver: profile, size: 140, tone: AvatarTone.navy)),
            const SizedBox(height: TtSpacing.l),
            Text('Riders see this photo', style: t.h1, textAlign: TextAlign.center),
            const SizedBox(height: TtSpacing.xs),
            Text('It shows on their trip so they know who is picking them up.',
                style: t.body.copyWith(color: TtColors.navy700), textAlign: TextAlign.center),
            const SizedBox(height: TtSpacing.xl),
            const _Tip(icon: Symbols.light_mode_rounded, text: 'Face a window or a light. No dark rooms'),
            const _Tip(icon: Symbols.face_rounded, text: 'Look straight at the camera, with a natural smile'),
            const _Tip(icon: Symbols.no_photography_rounded, text: 'No sunglasses, cap, helmet or mask'),
            const _Tip(icon: Symbols.person_rounded, text: 'Only you in the photo, plain background'),
          ] else ...[
            Center(
              child: ClipOval(child: Image.memory(bytes, width: 180, height: 180, fit: BoxFit.cover, gaplessPlayback: true)),
            ),
            const SizedBox(height: TtSpacing.l),
            Text('How riders will see you', style: t.h2),
            const SizedBox(height: TtSpacing.s),
            RiderPreviewCard(profile: profile, photo: MemoryImage(bytes)),
            const SizedBox(height: TtSpacing.s),
            Text('Check that your face is clear and bright. You can retake it as many times as you like.',
                style: t.bodySmall.copyWith(color: TtColors.navy500)),
            if (_error != null) ...[
              const SizedBox(height: TtSpacing.m),
              Container(
                padding: const EdgeInsets.all(TtSpacing.m),
                decoration: const BoxDecoration(color: TtColors.errorTint, borderRadius: TtRadii.cardRadius),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Symbols.error_rounded, color: TtColors.error, size: 20, fill: 1),
                  const SizedBox(width: TtSpacing.s),
                  Expanded(child: Text(_error!, style: t.bodySmall.copyWith(color: TtColors.navy900))),
                ]),
              ),
            ],
          ],
        ],
      ),
      bottomNavigationBar: BottomActions(
        children: bytes == null
            ? [TtButton(label: 'Take photo', icon: Symbols.photo_camera_rounded, onPressed: _take)]
            : [
                TtButton(label: 'Use this photo', icon: Symbols.check_rounded, loading: _saving, onPressed: _saving ? null : _use),
                const SizedBox(height: TtSpacing.s),
                TtButton.secondary(label: 'Retake', icon: Symbols.refresh_rounded, onPressed: _saving ? null : _take),
              ],
      ),
    );
  }
}

/// The driver card riders see while the driver is on the way: photo, name, rating, vehicle and plate.
class RiderPreviewCard extends StatelessWidget {
  const RiderPreviewCard({super.key, required this.profile, required this.photo});
  final DriverProfile profile;
  final ImageProvider photo;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Semantics(
      label: 'Preview of your card in the rider app',
      child: Container(
        padding: const EdgeInsets.all(TtSpacing.l),
        decoration: BoxDecoration(
          color: TtColors.surface,
          borderRadius: TtRadii.cardRadius,
          border: Border.all(color: TtColors.divider),
        ),
        child: Row(children: [
          TtAvatar(initials: profile.initials, size: 56, tone: AvatarTone.navy, image: photo),
          const SizedBox(width: TtSpacing.m),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(profile.name, style: t.bodySemibold.copyWith(fontSize: 17), overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 6),
                const Icon(Symbols.star_rounded, fill: 1, size: 18, color: TtColors.warning),
                Text(profile.rating.toStringAsFixed(1), style: t.bodySmallMedium),
              ]),
              const SizedBox(height: 2),
              Text(profile.vehicleLabel, style: t.bodySmall.copyWith(color: TtColors.navy500), overflow: TextOverflow.ellipsis),
            ]),
          ),
          const SizedBox(width: TtSpacing.s),
          NumberPlate(plate: profile.plate, vehicle: profile.vehicleKind),
        ]),
      ),
    );
  }
}

class _Tip extends StatelessWidget {
  const _Tip({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: TtSpacing.s),
        child: Row(children: [
          Icon(icon, color: TtColors.coral600, size: 24),
          const SizedBox(width: TtSpacing.m),
          Expanded(child: Text(text, style: context.type.body)),
        ]),
      );
}
