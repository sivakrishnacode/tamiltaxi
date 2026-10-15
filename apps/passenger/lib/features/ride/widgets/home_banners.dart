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

/// Home banners (6j): the admin's pictures under "More ways to travel", swiped through like Rapido's. × hides one
/// until the app restarts; a tap opens its link in the browser. Nothing at all while there are none.
class HomeBanners extends ConsumerStatefulWidget {
  const HomeBanners({super.key});

  @override
  ConsumerState<HomeBanners> createState() => _HomeBannersState();
}

class _HomeBannersState extends ConsumerState<HomeBanners> {
  final _pages = PageController();
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
          AspectRatio(
            aspectRatio: 2,
            child: PageView.builder(
              controller: _pages,
              itemCount: shown.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, i) => _BannerCard(
                banner: shown[i],
                onClose: () => ref.read(closedBannersProvider.notifier).close(shown[i].id),
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
}

class _BannerCard extends StatelessWidget {
  const _BannerCard({required this.banner, required this.onClose});

  final Promo banner;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final link = banner.linkUrl;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: ClipRRect(
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
                child: InkWell(
                  onTap: () => launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication),
                ),
              ),
            Positioned(
              top: 0,
              right: 0,
              child: IconButton(
                tooltip: 'Close banner',
                onPressed: onClose,
                icon: Container(
                  width: 26,
                  height: 26,
                  decoration: const BoxDecoration(color: Color(0x8C000000), shape: BoxShape.circle),
                  child: const Icon(Symbols.close_rounded, size: 16, color: Colors.white),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
