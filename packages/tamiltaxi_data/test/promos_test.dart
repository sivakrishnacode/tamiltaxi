import 'package:flutter_test/flutter_test.dart';
import 'package:tamiltaxi_data/tamiltaxi_data.dart';

void main() {
  const base = 'https://api.example/v1';

  test('reads the splash and the banners, with picture URLs under the API', () {
    final promos = Promos.fromJson({
      'splash': {
        'id': 's1',
        'title': 'Happy Diwali',
        'imagePath': '/promos/s1/image',
        'linkUrl': null,
        'startsAt': '2026-11-08T18:30:00.000Z',
        'endsAt': '2026-11-09T18:30:00.000Z',
      },
      'banners': [
        {'id': 'b1', 'title': 'Drive with us', 'imagePath': '/promos/b1/image', 'linkUrl': 'https://x.example/drive', 'startsAt': '2026-10-01T00:00:00.000Z', 'endsAt': null},
        {'id': 'b2', 'title': 'No link', 'imagePath': '/promos/b2/image', 'linkUrl': 'javascript:alert(1)', 'startsAt': '2026-10-01T00:00:00.000Z'},
        {'id': 'broken'},
      ],
    }, baseUrl: base);
    expect(promos.splash!.imageUrl, '$base/promos/s1/image');
    expect(promos.splash!.isLiveAt(DateTime.utc(2026, 11, 9)), isTrue);
    expect(promos.splash!.isLiveAt(DateTime.utc(2026, 11, 8)), isFalse);
    expect(promos.splash!.isLiveAt(DateTime.utc(2026, 11, 10)), isFalse);
    expect(promos.banners.map((b) => b.id), ['b1', 'b2']);
    expect(promos.banners[0].linkUrl, 'https://x.example/drive');
    // Only https links are opened.
    expect(promos.banners[1].linkUrl, isNull);
  });

  test('anything unexpected means no pictures', () {
    expect(Promos.fromJson(null).banners, isEmpty);
    expect(Promos.fromJson({'splash': 'x', 'banners': 'y'}).splash, isNull);
  });
}
