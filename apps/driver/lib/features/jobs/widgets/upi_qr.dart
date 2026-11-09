import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

/// The driver's own UPI QR with [amount] filled in (D-19 Collect payment, D-42c meter), the app icon in the middle.
class UpiQr extends StatelessWidget {
  const UpiQr({super.key, required this.upiId, required this.payee, required this.amount, this.size = 196});

  final String upiId;
  final String payee;
  final int amount;
  final double size;

  @override
  Widget build(BuildContext context) {
    final data = 'upi://pay?pa=$upiId&pn=${Uri.encodeComponent(payee)}&am=$amount&cu=INR';
    return Container(
      padding: const EdgeInsets.all(TtSpacing.m),
      decoration: BoxDecoration(
        color: TtColors.surface,
        borderRadius: const BorderRadius.all(Radius.circular(20)),
        border: Border.all(color: TtColors.divider),
        boxShadow: TtShadows.soft,
      ),
      child: Stack(alignment: Alignment.center, children: [
        QrImageView(
          data: data,
          size: size,
          padding: EdgeInsets.zero,
          errorCorrectionLevel: QrErrorCorrectLevel.H,
          semanticsLabel: 'UPI QR code for $upiId',
          eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: TtColors.navy900),
          dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: TtColors.navy900),
        ),
        // The Tamil Taxi app icon (it was a coral "r" from the old name). Error correction H keeps the code readable
        // under it.
        Container(
          width: size * 0.245,
          height: size * 0.245,
          decoration: const BoxDecoration(shape: BoxShape.circle, color: TtColors.surface, boxShadow: TtShadows.soft),
          padding: const EdgeInsets.all(3),
          child: ClipOval(
            child: Image.asset('assets/brand/launcher_rider.png', package: 'tamiltaxi_ui', fit: BoxFit.cover),
          ),
        ),
      ]),
    );
  }
}
