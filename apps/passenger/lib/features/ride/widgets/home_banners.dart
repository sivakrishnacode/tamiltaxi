import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';
import 'package:tamiltaxi_ui/tamiltaxi_ui.dart';
import 'package:url_launcher/url_launcher.dart';

/// Banner ids the rider closed with × since the app started: in memory only, so they are back after a restart.
final closedBannersProvider = NotifierProvider<ClosedBanners, Set<String>>(ClosedBanners.new);

class ClosedBanners extends Notifier<Set<String>> {
  @override
  Set<String> build() => {};

  void close(String id) => state = {...state, id};
}

/// Home banners (6j): the admin's pictures under "More ways to travel", swiped through like Rapido's. With two or
/// more, each is [_pageFraction] of the width, so the start of the next one peeks in at the edge; a single banner
/// takes the full width. Pictures keep their 2 : 1 shape (the admin's 1200 × 600). × hides one until the app
/// restarts; a tap opens its link in the browser. Nothing at all while there are none.
class HomeBanners extends ConsumerStatefulWidget {
  const HomeBanners({super.key});

  @override
  ConsumerState<HomeBanners> createState() => _HomeBannersState();
}

/// The width of one banner page when there are several; the rest shows the next banner.
const _pageFraction = 0.9;

/// Space between two banners in the row.
const _gap = 8.0;

class _HomeBannersState extends ConsumerState<HomeBanners> {
  final _pages = PageController(viewportFraction: _pageFraction);
  int _page = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final closed = ref.watch(closedBannersProvider);
    final banners = ref.watch(promosProvider).value?.banners ?? const <Promo>[];
    final now = DateTime.now();
    final shown = [for (final b in banners) if (!closed.contains(b.id) && b.isLiveAt(now)) b];
    if (shown.isEmpty) return const SizedBox.shrink();
    final page = _page.clamp(0, shown.length - 1);
    return Padding(
      padding: const EdgeInsets.only(top: TtSpacing.l),
      child: Column(
        children: [
          if (shown.length == 1)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: AspectRatio(aspectRatio: 2, child: _card(shown.single)),
            )
          else
            LayoutBuilder(
              builder: (context, constraints) => SizedBox(
                // A page is _pageFraction of the width, less the gap: the picture inside stays 2 : 1.
                height: (constraints.maxWidth * _pageFraction - _gap) / 2,
                child: PageView.builder(
                  controller: _pages,
                  // The first banner lines up with the content above; the last ends at the right edge.
                  padEnds: false,
                  itemCount: shown.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, i) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: _gap / 2),
                    child: _card(shown[i]),
                  ),
                ),
              ),
            ),
          if (shown.length > 1) ...[
            const SizedBox(height: TtSpacing.s),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < shown.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == page ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == page ? TtColors.navy900 : TtColors.navy300,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _card(Promo banner) =>
      _BannerCard(banner: banner, onClose: () => ref.read(closedBannersProvider.notifier).close(banner.id));
}

class _BannerCard extends StatelessWidget {
  const _BannerCard({required this.banner, required this.onClose});

  final Promo banner;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final link = banner.linkUrl;
    return ClipRRect(
      borderRadius: TtRadii.cardRadius,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const ColoredBox(color: TtColors.inputBg),
          Semantics(
            image: true,
            button: link != null,
            label: banner.title,
            child: Image.network(
              banner.imageUrl,
              fit: BoxFit.cover,
              excludeFromSemantics: true,
              frameBuilder: (context, child, frame, sync) => AnimatedOpacity(
                opacity: sync || frame != null ? 1 : 0,
                duration: const Duration(milliseconds: 250),
                child: child,
              ),
              errorBuilder: (context, error, stack) => const SizedBox.shrink(),
            ),
          ),
          if (link != null)
            Material(
              type: MaterialType.transparency,
              child: InkWell(onTap: () => launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication)),
            ),
          // A small, quiet × 6 dp from the corner; the button around it keeps a full-size tap area.
          Positioned(
            top: -8,
            right: -8,
            child: IconButton(
              tooltip: 'Close banner',
              onPressed: onClose,
              icon: Container(
                width: 20,
                height: 20,
                decoration: const BoxDecoration(color: Color(0x59000000), shape: BoxShape.circle),
                child: const Icon(Symbols.close_rounded, size: 13, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
