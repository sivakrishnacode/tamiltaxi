import 'package:flutter/material.dart';

import '../theme/tt_colors.dart';
import '../theme/tt_tokens.dart';

/// Sheet heights from DS-05: peek ≈ 24%, half ≈ 50%, full ≈ 92%.
abstract final class SheetSizes {
  static const double peek = 0.24;
  static const double half = 0.5;
  static const double full = 0.92;
}

/// A draggable bottom sheet that sits over a map, with a drag handle and 16px top corners.
/// Content scrolls inside the sheet via the provided controller.
class MapBottomSheet extends StatelessWidget {
  const MapBottomSheet({
    super.key,
    required this.builder,
    this.initialSize = SheetSizes.half,
    this.minSize = SheetSizes.peek,
    this.maxSize = SheetSizes.full,
    this.controller,
    this.padding = const EdgeInsets.fromLTRB(16, 0, 16, 16),
    this.footer,
  });

  /// Build the sheet's children; they are placed in a ListView using [ScrollController].
  final List<Widget> Function(BuildContext context) builder;
  final double initialSize;
  final double minSize;
  final double maxSize;
  final DraggableScrollableController? controller;
  final EdgeInsets padding;

  /// Shown after the children, edge to edge and pinned to the sheet's bottom edge (outside [padding]).
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      controller: controller,
      initialChildSize: initialSize,
      minChildSize: minSize,
      maxChildSize: maxSize,
      // Free dragging: snapping rebuilt its size list on every parent rebuild, which could
      // interrupt a drag and leave the sheet stuck open.
      snap: false,
      builder: (context, scroll) => DecoratedBox(
        decoration: const BoxDecoration(
          color: TtColors.surface,
          borderRadius: TtRadii.sheetTop,
          boxShadow: TtShadows.raised,
        ),
        child: footer == null
            ? ListView(
                controller: scroll,
                padding: padding,
                children: [const SheetHandle(), ...builder(context)],
              )
            : CustomScrollView(
                controller: scroll,
                slivers: [
                  SliverPadding(
                    padding: padding,
                    sliver: SliverList.list(children: [const SheetHandle(), ...builder(context)]),
                  ),
                  // The footer sits on the sheet's bottom edge: when the content is shorter than the open sheet, the
                  // free space goes above the picture instead of a blank band under it.
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [footer!]),
                  ),
                ],
              ),
      ),
    );
  }
}

/// The 40 × 4 drag handle.
class SheetHandle extends StatelessWidget {
  const SheetHandle({super.key});

  @override
  Widget build(BuildContext context) => Center(
        child: Container(
          margin: const EdgeInsets.only(top: 10, bottom: 14),
          width: 40,
          height: 4,
          decoration: BoxDecoration(color: TtColors.divider, borderRadius: TtRadii.pillRadius),
        ),
      );
}

/// A plain (non-draggable) sheet body: white, rounded top, handle. Use for fixed
/// sheets that sit at the bottom of a map screen.
class FixedBottomSheet extends StatelessWidget {
  const FixedBottomSheet({super.key, required this.child, this.padding = const EdgeInsets.fromLTRB(16, 0, 16, 16)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: TtColors.surface,
          borderRadius: TtRadii.sheetTop,
          boxShadow: TtShadows.raised,
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: padding,
            child: Column(mainAxisSize: MainAxisSize.min, children: [const SheetHandle(), child]),
          ),
        ),
      );
}

/// Shows a modal Tamil Taxi bottom sheet with a handle. Returns the sheet's result.
Future<T?> showTtSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  EdgeInsets padding = const EdgeInsets.fromLTRB(16, 0, 16, 16),
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    useSafeArea: true,
    backgroundColor: TtColors.surface,
    shape: const RoundedRectangleBorder(borderRadius: TtRadii.sheetTop),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: SingleChildScrollView(
        child: Padding(
          padding: padding,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [const SheetHandle(), builder(ctx)],
          ),
        ),
      ),
    ),
  );
}
