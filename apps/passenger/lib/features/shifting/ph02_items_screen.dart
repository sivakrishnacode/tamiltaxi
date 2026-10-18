import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';

import '../../router/routes.dart';
import '../../state/shifting_flow.dart';
import 'widgets/shifting_widgets.dart';

/// PH-02 House shifting · what you're moving: how big the home is (it sets the vehicle and helpers, and the price shows
/// from here), then the things on one line each, no catalogue to scroll through: "2 chairs", "Fridge - single door"
/// (how many first, a note for the movers after a dash), or a whole list pasted at once. Tap an item to edit it.
/// Next → PH-03 day and extras.
class PH02ItemsScreen extends ConsumerStatefulWidget {
  const PH02ItemsScreen({super.key, this.showcase = false});

  /// Opened on its own from the Design gallery: render the sample plan, start no timers.
  final bool showcase;

  @override
  ConsumerState<PH02ItemsScreen> createState() => _PH02ItemsScreenState();
}

class _PH02ItemsScreenState extends ConsumerState<PH02ItemsScreen> {
  final _name = TextEditingController();
  final _nameFocus = FocusNode();

  @override
  void dispose() {
    _name.dispose();
    _nameFocus.dispose();
    super.dispose();
  }

  /// The line as typed: "2 chairs" is two chairs, "Fridge - single door" a fridge with a note ([parseItemList]).
  void _add([String? _]) {
    final items = parseItemList(_name.text);
    if (items.isNotEmpty) {
      ref.read(shiftingFlowProvider.notifier).addItems(items);
      setState(_name.clear);
    }
    // Ready for the next one.
    _nameFocus.requestFocus();
  }

  Future<void> _paste() async {
    final items = await showTtSheet<List<ShiftingItem>>(
      context,
      builder: (_) => const _PasteListSheet(),
    );
    if (items == null || items.isEmpty || !mounted) return;
    // The list growing is the confirmation (a snack would cover the Next button).
    ref.read(shiftingFlowProvider.notifier).addItems(items);
  }

  Future<void> _edit(int index, ShiftingItem item) async {
    final result = await showTtSheet<ShiftingItem?>(
      context,
      builder: (_) => _EditItemSheet(item: item),
    );
    if (!mounted || result == null) return;
    final flow = ref.read(shiftingFlowProvider.notifier);
    // An empty name from the sheet's Remove.
    result.name.isEmpty
        ? flow.removeItem(index)
        : flow.updateItem(index, result);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    final s = widget.showcase
        ? ShiftingFlowState.sample()
        : ref.watch(shiftingFlowProvider);
    final items = s.details.items;
    final count = s.details.itemCount;
    final full = items.length >= GoodsModeRates.maxItems;
    final helpers = s.quote?.lines.helperCount ?? s.pricing.shifting.size(s.details.homeSize).helpers;
    final canAdd = !widget.showcase && !full && _name.text.trim().isNotEmpty;

    return ShiftingScaffold(
      error: s.quoteError,
      onRetry: () => ref.read(shiftingFlowProvider.notifier).refreshQuote(),
      title: 'Packers & Movers',
      step: 2,
      bottom: ShiftingPriceBar(
        pricing: s.quoteError == null,
        total: s.quote?.lines.total,
        caption: items.isEmpty ? 'Add at least one item' : moverTeam(s.vehicleOrSuggested, helpers),
        label: 'Day & extras',
        onPressed: widget.showcase
            ? () {}
            : (items.isEmpty
                  ? null
                  : () => context.push(Routes.shiftingSchedule)),
      ),
      children: [
        const ShiftingHeading(
          title: 'How big is the home?',
          subtitle: 'Sets the vehicle and the helpers. You can pick another vehicle on the next step.',
        ),
        HomeSizeList(
          selected: s.details.homeSize,
          rates: s.pricing.shifting,
          onChanged: widget.showcase ? null : ref.read(shiftingFlowProvider.notifier).setHomeSize,
        ),
        const SizedBox(height: TtSpacing.xl),
        ShiftingHeading(
          title: 'What are you moving?',
          subtitle: 'Details after a dash: Fridge - single door',
          trailing: TextButton.icon(
            // Design gallery: looks ready, does nothing.
            onPressed: widget.showcase ? () {} : (full ? null : _paste),
            icon: const Icon(Symbols.content_paste_rounded, size: 18),
            label: const Text('Paste a list'),
            style: TextButton.styleFrom(foregroundColor: TtColors.coral600, minimumSize: const Size(48, 40)),
          ),
        ),
        TtTextField(
          hint: full ? 'The list is full (${GoodsModeRates.maxItems})' : 'Add an item, e.g. 2 chairs',
          controller: _name,
          focusNode: _nameFocus,
          enabled: !full,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.done,
          prefixIcon: Symbols.chair_rounded,
          inputFormatters: [LengthLimitingTextInputFormatter(120)],
          onChanged: (_) => setState(() {}),
          onSubmitted: _add,
          suffix: Padding(
            padding: const EdgeInsets.only(right: 6),
            child: IconButton.filled(
              tooltip: 'Add to list',
              onPressed: canAdd ? _add : null,
              style: IconButton.styleFrom(
                backgroundColor: TtColors.coral600,
                foregroundColor: TtColors.surface,
                disabledBackgroundColor: TtColors.divider,
                disabledForegroundColor: TtColors.navy300,
                fixedSize: const Size.square(40),
              ),
              icon: const Icon(Symbols.add_rounded),
            ),
          ),
        ),
        const SizedBox(height: TtSpacing.l),
        if (items.isEmpty)
          const _EmptyList()
        else ...[
          Row(
            children: [
              Text('YOUR LIST', style: t.overline),
              const Spacer(),
              Text('$count thing${count == 1 ? '' : 's'}', style: t.caption.copyWith(color: TtColors.navy500)),
            ],
          ),
          const SizedBox(height: TtSpacing.s),
          Container(
            decoration: BoxDecoration(
              color: TtColors.surface,
              borderRadius: TtRadii.cardRadius,
              border: Border.all(color: TtColors.divider),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = items.length - 1; i >= 0; i--) ...[
                  _ItemRow(
                    key: ValueKey('item-$i-${items[i].name}'),
                    item: items[i],
                    onTap: widget.showcase ? null : () => _edit(i, items[i]),
                    onRemove: widget.showcase ? null : () => ref.read(shiftingFlowProvider.notifier).removeItem(i),
                  ),
                  if (i > 0) const Divider(height: 1, indent: 60),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({super.key, required this.item, required this.onTap, required this.onRemove});
  final ShiftingItem item;
  final VoidCallback? onTap;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(TtSpacing.m, TtSpacing.s, TtSpacing.xs, TtSpacing.s),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: TtColors.coral50, shape: BoxShape.circle),
              child: Text('×${item.qty}', style: TtTextStyles.tabular(t.caption.copyWith(color: TtColors.coral700, fontWeight: FontWeight.w700))),
            ),
            const SizedBox(width: TtSpacing.m),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name, style: t.bodySemibold, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (item.note.isNotEmpty)
                    Text(item.note, style: t.bodySmall.copyWith(color: TtColors.navy500), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Remove ${item.name}',
              onPressed: onRemove,
              icon: const Icon(Symbols.close_rounded, size: 20, color: TtColors.navy500),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyList extends StatelessWidget {
  const _EmptyList();

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: TtSpacing.l, vertical: TtSpacing.xl),
      decoration: BoxDecoration(
        borderRadius: TtRadii.cardRadius,
        border: Border.all(color: TtColors.divider),
      ),
      child: Column(
        children: [
          const Icon(Symbols.checklist_rounded, size: 40, color: TtColors.navy300),
          const SizedBox(height: TtSpacing.s),
          Text('Nothing on the list yet', style: t.bodySemibold),
          const SizedBox(height: 4),
          Text(
            'Big things first: beds, almirahs, the fridge, the washing machine. Then cartons and bags as one line each.',
            textAlign: TextAlign.center,
            style: t.bodySmall.copyWith(color: TtColors.navy500),
          ),
        ],
      ),
    );
  }
}

/// Edit one item; Remove pops an item with an empty name.
class _EditItemSheet extends StatefulWidget {
  const _EditItemSheet({required this.item});
  final ShiftingItem item;

  @override
  State<_EditItemSheet> createState() => _EditItemSheetState();
}

class _EditItemSheetState extends State<_EditItemSheet> {
  late final _name = TextEditingController(text: widget.item.name);
  late final _note = TextEditingController(text: widget.item.note);
  late int _qty = widget.item.qty;

  @override
  void dispose() {
    _name.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Edit item', style: t.h2),
        const SizedBox(height: TtSpacing.m),
        TtTextField(
          label: 'Item',
          controller: _name,
          textCapitalization: TextCapitalization.sentences,
          inputFormatters: [LengthLimitingTextInputFormatter(60)],
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: TtSpacing.m),
        TtTextField(
          label: 'Details',
          hint: 'Size, material, fragile…',
          controller: _note,
          textCapitalization: TextCapitalization.sentences,
          inputFormatters: [LengthLimitingTextInputFormatter(120)],
        ),
        const SizedBox(height: TtSpacing.m),
        Row(
          children: [
            Text('How many', style: t.bodySmallMedium.copyWith(color: TtColors.navy700)),
            const Spacer(),
            CountStepper(value: _qty, min: 1, max: 50, label: '$_qty', semanticsLabel: 'How many', onChanged: (v) => setState(() => _qty = v)),
          ],
        ),
        const SizedBox(height: TtSpacing.l),
        TtButton(
          label: 'Save',
          onPressed: _name.text.trim().isEmpty
              ? null
              : () => Navigator.of(context).pop(ShiftingItem(name: _name.text.trim(), qty: _qty, note: _note.text.trim())),
        ),
        const SizedBox(height: TtSpacing.xs),
        TtButton.text(
          label: 'Remove from list',
          expand: true,
          onPressed: () => Navigator.of(context).pop(const ShiftingItem(name: '')),
        ),
      ],
    );
  }
}

/// "Paste a list": one item per line; shows what it understood before adding.
class _PasteListSheet extends StatefulWidget {
  const _PasteListSheet();

  @override
  State<_PasteListSheet> createState() => _PasteListSheetState();
}

class _PasteListSheetState extends State<_PasteListSheet> {
  final _text = TextEditingController();
  List<ShiftingItem> _parsed = const [];

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.type;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Paste a list', style: t.h2),
        const SizedBox(height: 4),
        Text('One item per line. Write how many first, and details after a dash.', style: t.bodySmall.copyWith(color: TtColors.navy500)),
        const SizedBox(height: TtSpacing.m),
        TtTextField(
          hint: '2 chairs\nFridge - single door\nCartons x10',
          controller: _text,
          maxLines: 6,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (v) => setState(() => _parsed = parseItemList(v)),
        ),
        const SizedBox(height: TtSpacing.s),
        if (_parsed.isNotEmpty)
          Text(
            _parsed.take(4).map((i) => '${i.qty} × ${i.name}').join(' · ') + (_parsed.length > 4 ? ' · +${_parsed.length - 4} more' : ''),
            style: t.caption.copyWith(color: TtColors.navy700),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        const SizedBox(height: TtSpacing.l),
        TtButton(
          label: _parsed.isEmpty ? 'Add items' : 'Add ${_parsed.length} item${_parsed.length == 1 ? '' : 's'}',
          onPressed: _parsed.isEmpty ? null : () => Navigator.of(context).pop(_parsed),
        ),
      ],
    );
  }
}
