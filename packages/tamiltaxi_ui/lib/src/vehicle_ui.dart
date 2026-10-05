import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

/// UI helpers for [VehicleKind]: icon, display name, illustration and map glyph.
extension VehicleKindUi on VehicleKind {
  /// Material Symbols Rounded icon used on chips, small tiles and as the fallback art.
  IconData get icon => switch (this) {
        VehicleKind.bike || VehicleKind.scooty || VehicleKind.goodsBike => Symbols.two_wheeler_rounded,
        VehicleKind.auto || VehicleKind.autoPriority || VehicleKind.autoParcel => Symbols.electric_rickshaw_rounded,
        VehicleKind.cab || VehicleKind.sedan => Symbols.local_taxi_rounded,
        VehicleKind.suv => Symbols.airport_shuttle_rounded,
        VehicleKind.threeWheeler => Symbols.electric_rickshaw_rounded,
        VehicleKind.miniTruck => Symbols.local_shipping_rounded,
        VehicleKind.pickup => Symbols.airport_shuttle_rounded,
        VehicleKind.truck => Symbols.local_shipping_rounded,
      };

  /// "Bike", "Scooty", "Auto", "Auto Priority", "Mini", "Sedan", "SUV", "3-wheeler", "Mini truck", "Pickup", "Truck".
  String get label => switch (this) {
        VehicleKind.bike || VehicleKind.goodsBike => 'Bike',
        VehicleKind.scooty => 'Scooty',
        VehicleKind.auto || VehicleKind.autoParcel => 'Auto',
        VehicleKind.autoPriority => 'Auto Priority',
        VehicleKind.cab => 'Mini',
        VehicleKind.sedan => 'Sedan',
        VehicleKind.suv => 'SUV',
        VehicleKind.threeWheeler => '3-wheeler',
        VehicleKind.miniTruck => 'Mini truck',
        VehicleKind.pickup => 'Pickup',
        VehicleKind.truck => 'Truck',
      };

  /// The 3/4 render in `assets/vehicles/` (built by scripts/vehicle_icons/build.py); every vehicle has one. Nullable so
  /// a vehicle added later can show [icon] until its render arrives.
  String? get artAsset => switch (this) {
        VehicleKind.bike => 'packages/tamiltaxi_ui/assets/vehicles/bike.webp',
        VehicleKind.goodsBike => 'packages/tamiltaxi_ui/assets/vehicles/goods_bike.webp',
        VehicleKind.scooty => 'packages/tamiltaxi_ui/assets/vehicles/scooty.webp',
        VehicleKind.auto || VehicleKind.autoParcel => 'packages/tamiltaxi_ui/assets/vehicles/auto.webp',
        VehicleKind.autoPriority => 'packages/tamiltaxi_ui/assets/vehicles/auto_priority.webp',
        VehicleKind.cab => 'packages/tamiltaxi_ui/assets/vehicles/mini.webp',
        VehicleKind.sedan => 'packages/tamiltaxi_ui/assets/vehicles/sedan.webp',
        VehicleKind.suv => 'packages/tamiltaxi_ui/assets/vehicles/suv.webp',
        VehicleKind.threeWheeler => 'packages/tamiltaxi_ui/assets/vehicles/three_wheeler.webp',
        VehicleKind.miniTruck => 'packages/tamiltaxi_ui/assets/vehicles/mini_truck.webp',
        VehicleKind.pickup => 'packages/tamiltaxi_ui/assets/vehicles/pickup.webp',
        VehicleKind.truck => 'packages/tamiltaxi_ui/assets/vehicles/truck.webp',
      };

  /// Marker glyph class for the map.
  MapVehicleType get mapType => switch (this) {
        VehicleKind.bike || VehicleKind.scooty || VehicleKind.goodsBike => MapVehicleType.bike,
        VehicleKind.auto || VehicleKind.autoPriority || VehicleKind.autoParcel || VehicleKind.threeWheeler => MapVehicleType.auto,
        VehicleKind.cab || VehicleKind.sedan || VehicleKind.suv => MapVehicleType.car,
        VehicleKind.miniTruck || VehicleKind.pickup || VehicleKind.truck => MapVehicleType.truck,
      };
}

/// Top-down marker shapes (DS-06): bike, auto, car, truck.
enum MapVehicleType { bike, auto, car, truck }

/// A vehicle's picture: its soft 3D miniature ([VehicleKindUi.artAsset], front three-quarter view pointing right, with
/// its own ground shadow) fitted into [width] × [height], or, for vehicles without one, the coral symbol over a soft
/// ground shadow. Every miniature shares one canvas, so a bike reads smaller than a car at the same size. Decorative
/// (screen readers get the name next to it).
class VehicleArt extends StatelessWidget {
  const VehicleArt(this.kind, {super.key, this.width = 56, this.height = 40, this.color});

  final VehicleKind kind;
  final double width;
  final double height;

  /// Symbol colour for vehicles without a render (coral by default).
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final asset = kind.artAsset;
    return ExcludeSemantics(
      child: SizedBox(
        width: width,
        height: height,
        child: asset != null
            ? Image.asset(
                asset,
                fit: BoxFit.contain,
                filterQuality: FilterQuality.medium,
                // Tests and the first frame: keep the space, no broken-image box.
                errorBuilder: (context, error, stack) => _SymbolArt(kind: kind, color: color),
              )
            : _SymbolArt(kind: kind, color: color),
      ),
    );
  }
}

class _SymbolArt extends StatelessWidget {
  const _SymbolArt({required this.kind, this.color});
  final VehicleKind kind;
  final Color? color;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, c) {
          final size = (c.maxHeight * 0.82).clamp(12.0, c.maxWidth);
          return Stack(
            alignment: Alignment.center,
            children: [
              Positioned(
                bottom: 0,
                child: Container(
                  width: size * 1.3,
                  height: size * 0.1,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.all(Radius.elliptical(size, size * 0.1)),
                  ),
                ),
              ),
              Positioned(top: 0, child: Icon(kind.icon, size: size, color: color ?? const Color(0xFFF4511E), fill: 1)),
            ],
          );
        },
      );
}
