import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../common/showcase.dart';
import '../../state/driver_account.dart';
import '../../state/live_helpers.dart';
import 'widgets/signup_widgets.dart';

/// D-08 Upload document. D-08a: what to photograph for this document, a few tips, "Take photo" (the phone's camera)
/// or "Choose from gallery". D-08b: the photo with "Use photo" and "Retake". One photo per document (the API keeps
/// one file each), so there is no front / back.
///
/// Mock: no camera, a placeholder card; "Use photo" marks the document Under review, then Verified after 3 s, and
/// goes back. Live API: "Use photo" uploads the picture (JPG / PNG / WebP, up to 8 MB) and the document stays under
/// review until an admin checks it.
class D08UploadDocumentScreen extends ConsumerStatefulWidget {
  const D08UploadDocumentScreen({super.key, this.type = KycDocType.insurance, this.captured = false, this.showcase = false});

  final KycDocType type;

  /// Start in the captured state (D-08b).
  final bool captured;

  /// Opened on its own from the Design gallery: render seed state, start no timers.
  final bool showcase;

  @override
  ConsumerState<D08UploadDocumentScreen> createState() => _D08UploadDocumentScreenState();
}

class _D08UploadDocumentScreenState extends ConsumerState<D08UploadDocumentScreen> {
  late bool _captured = widget.captured;
  bool _submitting = false;

  /// Live API: the picked photo.
  Uint8List? _bytes;
  String? _filename;

  static const _maxBytes = 8 * 1024 * 1024;

  bool get _live => !widget.showcase && ref.read(isLiveApiProvider);

  /// "Photo of your …" and what must be readable in it.
  (String, String) get _what => switch (widget.type) {
        KycDocType.vehicleRc => ('RC', 'The side with the registration number, the owner\'s name and the vehicle details.'),
        KycDocType.insurance => (
            'insurance policy',
            'The page that shows the policy number, your vehicle number and the dates it is valid.',
          ),
        KycDocType.drivingLicence => ('driving licence', 'The side with your photo, name and licence number.'),
        KycDocType.aadhaar => ('Aadhaar card', 'The front, with your name, photo and Aadhaar number.'),
        KycDocType.policeVerification => ('police certificate', 'The whole certificate page.'),
      };

  IconData get _icon => switch (widget.type) {
        KycDocType.vehicleRc => Symbols.directions_car_rounded,
        KycDocType.insurance => Symbols.verified_user_rounded,
        _ => Symbols.badge_rounded,
      };

  /// Live API: camera or gallery, compressed on the phone (JPEG, longest side 1600 px, quality 80: a few
  /// hundred KB) so the upload is quick on mobile data.
  Future<void> _pick(ImageSource source) async {
    try {
      final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);
      if (file == null || !mounted) return;
      final bytes = await file.readAsBytes();
      final ext = file.name.contains('.') ? file.name.split('.').last.toLowerCase() : '';
      final safeExt = const {'jpg', 'jpeg', 'png', 'webp'}.contains(ext) ? ext : 'jpg';
      if (!mounted) return;
      setState(() {
        _bytes = bytes;
        _filename = '${widget.type.name}.$safeExt';
        _captured = true;
      });
    } on PlatformException catch (e) {
      if (!mounted) return;
      showTtSnack(
        context,
        e.code.contains('access_denied') || e.code.contains('permission')
            ? 'Allow camera and photo access for Tamil Taxi Driver in Settings'
            : "Couldn't open the ${source == ImageSource.camera ? 'camera' : 'gallery'}",
      );
    }
  }

  Future<void> _use() async {
    if (widget.showcase) return showTtSnack(context, kPreviewNote);
    if (_submitting) return;
    if (_live) return _upload();
    setState(() => _submitting = true);
    await ref.read(kycProvider.notifier).upload(widget.type);
    if (!mounted) return;
    showTtSnack(context, '${widget.type.label} uploaded. We\'re reviewing it.', success: true);
    Navigator.of(context).maybePop();
  }

  Future<void> _upload() async {
    final bytes = _bytes;
    final name = _filename;
    if (bytes == null || name == null) {
      setState(() => _captured = false);
      return;
    }
    if (bytes.length > _maxBytes) {
      showTtSnack(context, 'That photo is over 8 MB. Retake it or pick a smaller one.');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(kycProvider.notifier).uploadFile(widget.type, bytes, name);
    } on OfflineException {
      // No response in time (weak signal) or no connection.
      if (!mounted) return;
      setState(() => _submitting = false);
      showTtSnack(context, "Upload didn't finish. Check your internet and tap Use photo again.");
      return;
    } on Exception catch (e) {
      // The API's reason, e.g. a file type or size it doesn't accept.
      if (!mounted) return;
      setState(() => _submitting = false);
      showTtSnack(context, userMessage(e));
      return;
    }
    if (!mounted) return;
    showTtSnack(context, '${widget.type.label} uploaded. An admin will review it.', success: true);
    Navigator.of(context).maybePop();
  }

  /// Mock: no camera; a placeholder stands in for the photo.
  void _fake({bool gallery = false}) {
    setState(() => _captured = true);
    if (gallery) showTtSnack(context, 'Photo picked from gallery');
  }

  void _retake() => setState(() {
        _captured = false;
        _bytes = null;
      });

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final (noun, what) = _what;
    final bytes = _bytes;
    return Scaffold(
      backgroundColor: TtColors.background,
      appBar: TtAppBar(title: widget.type.label),
      body: ListView(
        padding: const EdgeInsets.all(TtSpacing.l),
        children: [
          if (!_captured) ...[
            Center(
              child: Container(
                width: 96,
                height: 96,
                decoration: const BoxDecoration(color: TtColors.coral50, borderRadius: TtRadii.cardRadius),
                child: Icon(_icon, size: 48, color: TtColors.coral600),
              ),
            ),
            const SizedBox(height: TtSpacing.l),
            Text('Photo of your $noun', style: t.h1, textAlign: TextAlign.center),
            const SizedBox(height: TtSpacing.xs),
            Text(what, style: t.body.copyWith(color: TtColors.navy700), textAlign: TextAlign.center),
            const SizedBox(height: TtSpacing.xl),
            const _Tip(icon: Symbols.light_mode_rounded, text: 'Good light, no glare or shadow on it'),
            const _Tip(icon: Symbols.crop_free_rounded, text: 'All 4 corners inside the photo'),
            const _Tip(icon: Symbols.text_fields_rounded, text: 'Sharp enough to read every number'),
            if (widget.type == KycDocType.insurance)
              const _Tip(
                icon: Symbols.picture_as_pdf_rounded,
                text: 'Got the policy as a PDF? Take a screenshot of that page and choose it from the gallery',
              ),
          ] else ...[
            Container(
              height: 300,
              decoration: const BoxDecoration(color: TtColors.navy900, borderRadius: TtRadii.cardRadius),
              clipBehavior: Clip.antiAlias,
              child: bytes != null
                  ? _PhotoPreview(bytes: bytes, label: widget.type.label, uploading: _submitting)
                  : Center(
                      child: Padding(
                        padding: const EdgeInsets.all(TtSpacing.l),
                        child: AspectRatio(aspectRatio: 1.586, child: _CapturedCard(type: widget.type)),
                      ),
                    ),
            ),
            const SizedBox(height: TtSpacing.l),
            Text('Check it before you upload', style: t.h2),
            const SizedBox(height: TtSpacing.xs),
            Text(
              'All 4 corners in, nothing blurry, and the name and numbers easy to read. If not, retake it.',
              style: t.body.copyWith(color: TtColors.navy700),
            ),
          ],
        ],
      ),
      bottomNavigationBar: BottomActions(
        children: !_captured
            ? [
                TtButton(
                  label: 'Take photo',
                  icon: Symbols.photo_camera_rounded,
                  onPressed: () => _live ? _pick(ImageSource.camera) : _fake(),
                ),
                const SizedBox(height: TtSpacing.s),
                TtButton.secondary(
                  label: 'Choose from gallery',
                  icon: Symbols.photo_library_rounded,
                  onPressed: () => _live ? _pick(ImageSource.gallery) : _fake(gallery: true),
                ),
              ]
            : [
                TtButton(
                  label: 'Use photo',
                  icon: Symbols.check_rounded,
                  loading: _submitting,
                  onPressed: _submitting ? null : _use,
                ),
                const SizedBox(height: TtSpacing.s),
                TtButton.secondary(label: 'Retake', icon: Symbols.refresh_rounded, onPressed: _submitting ? null : _retake),
              ],
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

/// Live API: the picked photo, dimmed with a spinner while it uploads.
class _PhotoPreview extends StatelessWidget {
  const _PhotoPreview({required this.bytes, required this.label, required this.uploading});
  final Uint8List bytes;
  final String label;
  final bool uploading;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: TtRadii.cardRadius,
        child: Stack(fit: StackFit.expand, children: [
          Image.memory(bytes, fit: BoxFit.contain, semanticLabel: 'Photo of your $label', gaplessPlayback: true),
          if (uploading)
            ColoredBox(
              color: Colors.black54,
              child: Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const SizedBox(
                    width: 36,
                    height: 36,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3),
                  ),
                  const SizedBox(height: TtSpacing.s),
                  Text('Uploading…', style: context.type.bodySemibold.copyWith(color: Colors.white)),
                ]),
              ),
            ),
        ]),
      );
}

/// A placeholder photo of the document: header strip, a greyed photo and blurred detail bars.
class _CapturedCard extends StatelessWidget {
  const _CapturedCard({required this.type});

  final KycDocType type;

  (String, String) get _header => switch (type) {
        KycDocType.drivingLicence => ('INDIAN UNION DRIVING LICENCE', 'TAMIL NADU'),
        KycDocType.aadhaar => ('AADHAAR · GOVERNMENT OF INDIA', 'UIDAI'),
        KycDocType.vehicleRc => ('CERTIFICATE OF REGISTRATION', 'TAMIL NADU'),
        KycDocType.insurance => ('MOTOR INSURANCE POLICY', 'TWO-WHEELER'),
        KycDocType.policeVerification => ('POLICE CLEARANCE CERTIFICATE', 'TN POLICE'),
      };

  String get _firstLabel => switch (type) {
        KycDocType.drivingLicence => 'DL No:',
        KycDocType.aadhaar => 'Aadhaar No:',
        KycDocType.vehicleRc => 'Reg No:',
        KycDocType.insurance => 'Policy No:',
        KycDocType.policeVerification => 'Cert No:',
      };

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final (left, right) = _header;
    Widget bar(double f) => FractionallySizedBox(
          widthFactor: f,
          alignment: Alignment.centerLeft,
          child: Container(
            height: 10,
            margin: const EdgeInsets.symmetric(vertical: 5),
            decoration: const BoxDecoration(color: TtColors.navy300, borderRadius: TtRadii.pillRadius),
          ),
        );
    return Semantics(
      image: true,
      label: 'Captured photo of your ${type.label}, personal details hidden',
      child: Container(
        decoration: const BoxDecoration(color: TtColors.divider, borderRadius: TtRadii.cardRadius),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              color: TtColors.navy700,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(left,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: t.overline.copyWith(color: Colors.white)),
                  ),
                  const SizedBox(width: 8),
                  Text(right, style: t.overline.copyWith(color: Colors.white)),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AspectRatio(
                      aspectRatio: 0.8,
                      child: Container(
                        decoration: BoxDecoration(
                          color: TtColors.navy500.withValues(alpha: 0.55),
                          borderRadius: const BorderRadius.all(Radius.circular(8)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ClipRect(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(_firstLabel, style: t.caption.copyWith(fontWeight: FontWeight.w700)),
                                const SizedBox(width: 6),
                                Expanded(child: bar(0.9)),
                              ],
                            ),
                            bar(0.95),
                            bar(0.7),
                            bar(0.85),
                            if (type == KycDocType.drivingLicence)
                              Text('Valid till: ▒▒▒▒ · MCWG, LMV',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: t.caption.copyWith(fontWeight: FontWeight.w600))
                            else
                              bar(0.6),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
