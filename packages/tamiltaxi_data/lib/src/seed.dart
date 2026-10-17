import 'package:latlong2/latlong.dart';

import 'api/service_cities.dart';
import 'models/driver.dart';
import 'models/people.dart';
import 'models/place.dart';
import 'models/trip.dart';
import 'models/vehicle.dart';
import 'goods_modes.dart';
import 'ride_modes.dart';

/// The demo (mock mode, tests, the design gallery) runs on a fixed calendar day (24 Sep 2026) so seed dates, the free
/// trial and "next debit 24 Oct 2026" always line up; only the time of day is live. With the real API the apps call
/// [useRealDate] at start, so "Today" / "Yesterday" follow the phone's calendar.
abstract final class TtClock {
  static final DateTime _demoDay = DateTime(2026, 9, 24);
  static bool _real = false;

  /// Live API: today is today.
  static void useRealDate() => _real = true;

  static DateTime get today {
    if (!_real) return _demoDay;
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  static DateTime now() {
    final n = DateTime.now();
    if (_real) return n;
    return DateTime(_demoDay.year, _demoDay.month, _demoDay.day, n.hour, n.minute, n.second);
  }
}

/// All built-in seed data. Change values here; screens read them through the repositories.
abstract final class Seed {
  // ---------------------------------------------------------------- places
  static const gandhipuram = Place(
    id: 'gandhipuram',
    name: 'Gandhipuram Central Bus Stand',
    address: 'Cross Cut Rd, Gandhipuram',
    location: LatLng(11.0183, 76.9725),
  );
  static const brookefields = Place(
    id: 'brookefields',
    name: 'Brookefields Mall',
    address: 'Krishnasamy Rd, RS Puram',
    location: LatLng(11.0090, 76.9600),
  );
  static const rsPuram = Place(
    id: 'rs-puram',
    name: 'RS Puram',
    address: 'DB Rd, RS Puram',
    location: LatLng(11.0089, 76.9500),
  );
  static const peelamedu = Place(
    id: 'peelamedu',
    name: 'Peelamedu',
    address: 'Avinashi Rd, Peelamedu',
    location: LatLng(11.0290, 77.0270),
  );
  static const psgTech = Place(
    id: 'psg-tech',
    name: 'PSG Tech',
    address: 'Avinashi Rd, Peelamedu',
    location: LatLng(11.0247, 77.0028),
  );
  static const junction = Place(
    id: 'junction',
    name: 'Coimbatore Junction',
    address: 'State Bank Rd, Gopalapuram',
    location: LatLng(10.9960, 76.9660),
  );
  static const airport = Place(
    id: 'airport',
    name: 'Coimbatore International Airport',
    address: 'Avinashi Rd, Civil Aerodrome',
    location: LatLng(11.0300, 77.0434),
  );
  static const tidelPark = Place(
    id: 'tidel-park',
    name: 'Tidel Park',
    address: 'ELCOT SEZ, Vilankurichi Rd',
    location: LatLng(11.0310, 77.0280),
  );
  static const raceCourse = Place(
    id: 'race-course',
    name: 'Race Course',
    address: 'Race Course Rd, Coimbatore',
    location: LatLng(10.9990, 76.9780),
  );
  static const saibabaColony = Place(
    id: 'saibaba-colony',
    name: 'Saibaba Colony',
    address: 'NSR Rd, Saibaba Colony',
    location: LatLng(11.0240, 76.9440),
  );
  static const prozone = Place(
    id: 'prozone',
    name: 'Prozone Mall',
    address: 'Sathy Rd, Saravanampatti',
    location: LatLng(11.0550, 76.9950),
  );
  static const ukkadam = Place(
    id: 'ukkadam',
    name: 'Ukkadam',
    address: 'Palakkad Rd, Ukkadam',
    location: LatLng(10.9880, 76.9610),
  );
  static const townHall = Place(
    id: 'town-hall',
    name: 'Town Hall',
    address: 'Big Bazaar St, Town Hall',
    location: LatLng(10.9930, 76.9610),
  );
  static const singanallur = Place(
    id: 'singanallur',
    name: 'Singanallur',
    address: 'Trichy Rd, Singanallur',
    location: LatLng(10.9990, 77.0290),
  );
  static const brookefieldsPlaza = Place(
    id: 'brookefields-plaza',
    name: 'Brookefields Plaza',
    address: 'Brookebond Rd, RS Puram',
    location: LatLng(11.0096, 76.9612),
  );
  static const brookebondRoad = Place(
    id: 'brookebond-road',
    name: 'Brookebond Road',
    address: 'Saibaba Colony',
    location: LatLng(11.0112, 76.9575),
  );

  /// Demo outstation destinations (mock mode only; the live app suggests where riders actually went).
  static const outstationTowns = [
    Place(id: 'os-tiruppur', name: 'Tiruppur', address: 'Tiruppur, Tamil Nadu', location: LatLng(11.1085, 77.3411)),
    Place(id: 'os-ooty', name: 'Ooty', address: 'Udhagamandalam, The Nilgiris, Tamil Nadu', location: LatLng(11.4102, 76.6950)),
    Place(id: 'os-pollachi', name: 'Pollachi', address: 'Pollachi, Tamil Nadu', location: LatLng(10.6609, 77.0048)),
    Place(id: 'os-palakkad', name: 'Palakkad', address: 'Palakkad, Kerala', location: LatLng(10.7867, 76.6548)),
    Place(id: 'os-erode', name: 'Erode', address: 'Erode, Tamil Nadu', location: LatLng(11.3410, 77.7172)),
    Place(id: 'os-coonoor', name: 'Coonoor', address: 'Coonoor, The Nilgiris, Tamil Nadu', location: LatLng(11.3530, 76.7959)),
  ];

  /// A pin just outside the service area (for S-08).
  static const outsideArea = Place(
    id: 'outside',
    name: 'Mettupalayam',
    address: 'Outside Coimbatore',
    location: LatLng(11.2990, 76.9350),
  );

  static const List<Place> places = [
    gandhipuram,
    brookefields,
    brookefieldsPlaza,
    brookebondRoad,
    rsPuram,
    peelamedu,
    psgTech,
    junction,
    airport,
    tidelPark,
    raceCourse,
    saibabaColony,
    prozone,
    ukkadam,
    townHall,
    singanallur,
  ];

  /// Map centre for the whole city.
  static const LatLng cityCentre = LatLng(11.0168, 76.9658);

  /// The demo data's one city (mock mode). The live apps get every city from `GET /cities`.
  static const demoCity = ServiceCity(id: 'coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', center: cityCentre);

  /// Service area radius around [cityCentre].
  static const double serviceRadiusKm = 18;

  // ------------------------------------------------------------- vehicles
  static const bike = VehicleType(
    kind: VehicleKind.bike,
    name: 'Bike',
    fareRule: FareRule(base: 12, perKm: 5, perMin: 0.15, minFare: 25, waitPerMin: 1),
    etaMin: 2,
    seats: 1,
    badge: 'Lowest',
    subscriptionPrice: 2000,
  );
  static const scooty = VehicleType(
    kind: VehicleKind.scooty,
    name: 'Scooty',
    fareRule: FareRule(base: 14, perKm: 5.5, perMin: 0.2, minFare: 28, waitPerMin: 1),
    etaMin: 3,
    seats: 1,
    subscriptionPrice: 2000,
  );
  static const auto = VehicleType(
    kind: VehicleKind.auto,
    name: 'Auto',
    fareRule: FareRule(base: 25, perKm: 9, perMin: 0.3, minFare: 35, waitPerMin: 1),
    etaMin: 4,
    seats: 3,
    subscriptionPrice: 2000,
  );

  /// Auto drivers serve it at the higher fare and it is offered first (API `vehicle-match.ts`, `batch-assign.ts`). No
  /// badge: the long name needs the room, and its picture carries the bolt.
  static const autoPriority = VehicleType(
    kind: VehicleKind.autoPriority,
    name: 'Auto Priority',
    fareRule: FareRule(base: 30, perKm: 11, perMin: 0.35, minFare: 45, waitPerMin: 1),
    etaMin: 3,
    seats: 3,
    subscriptionPrice: 2000,
  );

  /// "Mini": the hatchback (the API's `CAB`).
  static const cab = VehicleType(
    kind: VehicleKind.cab,
    name: 'Mini',
    fareRule: FareRule(base: 48, perKm: 15, perMin: 1.5, minFare: 90, waitPerMin: 2),
    etaMin: 6,
    seats: 4,
    subscriptionPrice: 2000,
  );
  static const sedan = VehicleType(
    kind: VehicleKind.sedan,
    name: 'Sedan',
    fareRule: FareRule(base: 58, perKm: 18, perMin: 1.8, minFare: 110, waitPerMin: 2),
    etaMin: 7,
    seats: 4,
    badge: 'Comfort',
    subscriptionPrice: 2000,
  );
  static const suv = VehicleType(
    kind: VehicleKind.suv,
    name: 'SUV',
    fareRule: FareRule(base: 80, perKm: 24, perMin: 2.2, minFare: 150, waitPerMin: 3),
    etaMin: 9,
    seats: 6,
    subscriptionPrice: 2000,
  );
  static const goodsBike = VehicleType(
    kind: VehicleKind.goodsBike,
    name: 'Bike',
    fareRule: FareRule(base: 10, perKm: 5, perMin: 0.05, minFare: 30, waitPerMin: 1),
    etaMin: 3,
    capacityKg: 10,
    subscriptionPrice: 2000,
  );
  /// Parcel on Scooty (like Porter's "Scooter"): a passenger scooter takes it, up to 20 kg on the footboard and seat.
  static const scootyParcel = VehicleType(
    kind: VehicleKind.scootyParcel,
    name: 'Scooty',
    fareRule: FareRule(base: 12, perKm: 5.5, perMin: 0.1, minFare: 32, waitPerMin: 1),
    etaMin: 3,
    capacityKg: 20,
  );
  /// Parcel on Auto: a passenger auto (or a goods 3-wheeler) takes it at auto rates, inside the auto, up to 100 kg.
  static const autoParcel = VehicleType(
    kind: VehicleKind.autoParcel,
    name: 'Auto',
    fareRule: FareRule(base: 25, perKm: 9, perMin: 0.3, minFare: 40, waitPerMin: 1),
    etaMin: 4,
    capacityKg: 100,
  );
  static const threeWheeler = VehicleType(
    kind: VehicleKind.threeWheeler,
    name: '3-wheeler',
    fareRule: FareRule(base: 50, perKm: 15, perMin: 0.55, minFare: 120, waitPerMin: 2),
    etaMin: 6,
    capacityKg: 500,
    badge: 'Best value',
    modelHint: 'Goods auto',
    subscriptionPrice: 3000,
  );
  static const miniTruck = VehicleType(
    kind: VehicleKind.miniTruck,
    name: 'Mini truck',
    fareRule: FareRule(base: 140, perKm: 35, perMin: 0.2, minFare: 300, waitPerMin: 3),
    etaMin: 9,
    capacityKg: 750,
    modelHint: 'Tata Ace',
    subscriptionPrice: 4000,
  );
  static const pickupTruck = VehicleType(
    kind: VehicleKind.pickup,
    name: 'Pickup',
    fareRule: FareRule(base: 250, perKm: 45, perMin: 1, minFare: 500, waitPerMin: 3),
    etaMin: 12,
    capacityKg: 1500,
    modelHint: 'Bolero',
  );
  static const truck = VehicleType(
    kind: VehicleKind.truck,
    name: 'Truck',
    fareRule: FareRule(base: 500, perKm: 70, perMin: 1.5, minFare: 1000, waitPerMin: 4),
    etaMin: 15,
    capacityKg: 4000,
  );

  static const List<VehicleType> rideVehicles = [bike, scooty, auto, autoPriority, cab, sedan, suv];
  /// The parcel list in town, like Porter's: no [truck] (Packers & Movers and goods to another town only).
  static const List<VehicleType> goodsVehicles = [goodsBike, scootyParcel, autoParcel, threeWheeler, miniTruck, pickupTruck];
  static const List<VehicleType> allVehicles = [...rideVehicles, ...goodsVehicles, truck];

  static VehicleType vehicle(VehicleKind kind) => allVehicles.firstWhere((v) => v.kind == kind);

  // --------------------------------------------------------------- people
  static const karthik = DriverProfile(
    id: 'drv-karthik',
    name: 'Karthik S',
    phone: '+91 98430 12345',
    vehicleKind: VehicleKind.bike,
    vehicleModel: 'Honda Activa',
    vehicleColor: 'Grey',
    plate: 'TN 37 AB 4521',
    rating: 4.8,
    rides: 1240,
    upiId: 'karthik@okaxis',
  );
  static const murugan = DriverProfile(
    id: 'drv-murugan',
    name: 'Murugan P',
    phone: '+91 97890 22113',
    vehicleKind: VehicleKind.auto,
    vehicleModel: 'Bajaj RE',
    vehicleColor: 'Auto',
    plate: 'TN 38 C 7810',
    rating: 4.7,
    rides: 3180,
    upiId: 'murugan.p@oksbi',
  );
  static const arun = DriverProfile(
    id: 'drv-arun',
    name: 'Arun Kumar',
    phone: '+91 99440 55670',
    vehicleKind: VehicleKind.cab,
    vehicleModel: 'Maruti Dzire',
    vehicleColor: 'White',
    plate: 'TN 66 D 3302',
    rating: 4.9,
    rides: 2150,
    upiId: 'arunkumar@okhdfc',
  );
  static const selvam = DriverProfile(
    id: 'drv-selvam',
    name: 'Selvam R',
    phone: '+91 95000 71234',
    vehicleKind: VehicleKind.threeWheeler,
    vehicleModel: 'Bajaj Maxima Cargo',
    vehicleColor: 'Blue',
    plate: 'TN 37 F 9914',
    rating: 4.6,
    rides: 860,
    upiId: 'selvam.r@okicici',
  );
  static const vignesh = DriverProfile(
    id: 'drv-vignesh',
    name: 'Vignesh M',
    phone: '+91 90420 33871',
    vehicleKind: VehicleKind.goodsBike,
    vehicleModel: 'TVS Jupiter',
    vehicleColor: 'Black',
    plate: 'TN 37 BK 2210',
    rating: 4.7,
    rides: 540,
    upiId: 'vignesh@okaxis',
  );
  static const dinesh = DriverProfile(
    id: 'drv-dinesh',
    name: 'Dinesh K',
    phone: '+91 94860 11209',
    vehicleKind: VehicleKind.miniTruck,
    vehicleModel: 'Tata Ace',
    vehicleColor: 'White',
    plate: 'TN 37 G 5530',
    rating: 4.5,
    rides: 410,
    upiId: 'dinesh.k@okaxis',
  );

  static const List<DriverProfile> drivers = [karthik, murugan, arun, selvam, vignesh, dinesh];

  /// The driver assigned when a vehicle of [kind] is booked.
  static DriverProfile driverFor(VehicleKind kind) => switch (kind) {
        VehicleKind.bike || VehicleKind.scooty || VehicleKind.scootyParcel => karthik,
        VehicleKind.auto || VehicleKind.autoPriority || VehicleKind.autoParcel => murugan,
        VehicleKind.cab || VehicleKind.sedan || VehicleKind.suv => arun,
        VehicleKind.goodsBike => vignesh,
        VehicleKind.threeWheeler => selvam,
        VehicleKind.miniTruck || VehicleKind.pickup || VehicleKind.truck => dinesh,
      };

  static const amma = EmergencyContact(id: 'ec-amma', name: 'Amma', relation: 'Mother', phone: '+91 94430 11223');
  static const ravi = EmergencyContact(id: 'ec-ravi', name: 'Ravi', relation: 'Brother', phone: '+91 90030 44556');

  static const home = SavedPlace(id: 'sp-home', label: 'Home', kind: SavedPlaceKind.home, place: saibabaColony);
  static const work = SavedPlace(id: 'sp-work', label: 'Work', kind: SavedPlaceKind.work, place: tidelPark);

  static const priya = PassengerProfile(
    name: 'Priya Raman',
    phone: '+91 98765 43210',
    email: 'priya.raman@gmail.com',
    gender: Gender.female,
    rating: 4.9,
    savedPlaces: [home, work],
    emergencyContacts: [amma, ravi],
  );

  static const List<Place> recentDestinations = [brookefields, junction];

  static const receiverName = 'Meena Ravi';
  static const receiverPhone = '+91 94433 21098';

  // ---------------------------------------------------------------- codes
  static const rideOtp = '4829';
  static const deliveryOtp = '7153';

  /// Any 6 digits log in, except this one.
  static const badLoginOtp = '000000';

  // -------------------------------------------------------------- history
  static List<Trip> passengerHistory() {
    final d = TtClock.today;
    return [
      Trip(
        id: 'RD-24091528',
        kind: TripKind.ride,
        vehicle: VehicleKind.bike,
        pickup: gandhipuram,
        drop: brookefields,
        fare: 38,
        status: TripStatus.completed,
        startedAt: DateTime(d.year, d.month, d.day, 15, 28),
        driver: karthik,
        distanceKm: 4.2,
        durationMin: 14,
        paymentMode: PaymentMode.upi,
        rating: 5,
        pickupLabel: 'Gandhipuram',
        dropLabel: 'Brookefields',
      ),
      Trip(
        id: 'RD-23091842',
        kind: TripKind.ride,
        vehicle: VehicleKind.auto,
        pickup: rsPuram,
        drop: junction,
        fare: 64,
        status: TripStatus.completed,
        startedAt: DateTime(d.year, d.month, d.day - 1, 18, 42),
        driver: murugan,
        distanceKm: 3.6,
        durationMin: 12,
        rating: 4,
      ),
      Trip(
        id: 'PC-22091105',
        kind: TripKind.parcel,
        vehicle: VehicleKind.goodsBike,
        pickup: peelamedu,
        drop: raceCourse,
        fare: 49,
        status: TripStatus.delivered,
        startedAt: DateTime(d.year, d.month, d.day - 2, 11, 5),
        driver: vignesh,
        distanceKm: 6.8,
        durationMin: 23,
        otp: deliveryOtp,
        parcel: const ParcelDetails(
          category: ParcelCategory.documents,
          weight: WeightBand.under5,
          senderName: 'Priya Raman',
          senderPhone: '+91 98765 43210',
          receiverName: receiverName,
          receiverPhone: receiverPhone,
        ),
      ),
      Trip(
        id: 'RD-20090720',
        kind: TripKind.ride,
        vehicle: VehicleKind.cab,
        pickup: saibabaColony,
        drop: airport,
        fare: 310,
        status: TripStatus.cancelled,
        startedAt: DateTime(d.year, d.month, d.day - 4, 7, 20),
        driver: arun,
        distanceKm: 12.4,
        durationMin: 41,
        pickupLabel: 'Home',
        dropLabel: 'Airport',
      ),
    ];
  }

  // ----------------------------------------------------------------- chat
  static const List<String> quickReplies = [
    "I'm at the pickup point",
    'Please come fast',
    "I'm wearing a blue shirt",
    'Where are you?',
  ];

  static List<ChatMessage> chatSeed() {
    final d = TtClock.today;
    DateTime t(int h, int m) => DateTime(d.year, d.month, d.day, h, m);
    return [
      ChatMessage(id: 'm1', text: 'Hi madam, I am near Gandhipuram bus stand. Which gate?', fromMe: false, sentAt: t(15, 21)),
      ChatMessage(id: 'm2', text: 'Gate 2, opposite the Annapoorna hotel', fromMe: true, sentAt: t(15, 21)),
      ChatMessage(id: 'm3', text: 'Okay, 2 minutes. Grey Activa.', fromMe: false, sentAt: t(15, 22)),
      ChatMessage(id: 'm4', text: "I'm wearing a blue shirt", fromMe: true, sentAt: t(15, 22)),
    ];
  }

  /// Seeded replies the other side sends (in order, looping) 2 s after each message.
  static const List<String> driverReplies = [
    'Okay madam, I can see the gate.',
    'Coming, 1 minute.',
    'Traffic near the signal, reaching soon.',
    'I have reached. Grey Activa near the gate.',
  ];

  static const List<String> passengerReplies = [
    "Okay, I'm waiting at Gate 2.",
    "I'm wearing a blue shirt.",
    'Please come fast.',
    'I can see you now.',
  ];

  // -------------------------------------------------------------- support
  static const List<String> helpTopics = [
    'Lost item',
    'Driver behaviour',
    'Fare issue',
    'Parcel issue',
    'App problem',
    'Safety concern',
    'Delete my account',
  ];

  static const List<String> driverHelpTopics = [
    'Payment issue',
    'Plan & Autopay',
    'Documents / KYC',
    'Rider behaviour',
    'App problem',
    'Safety concern',
    'Delete my account',
  ];

  static List<SupportTicket> tickets() => [
        SupportTicket(
          id: 'TK-3321',
          topic: 'Fare issue',
          description: 'Auto, 18 Sep · Driver asked for extra ₹20.',
          status: TicketStatus.inProgress,
          createdAt: DateTime(2026, 9, 18, 19, 5),
        ),
      ];

  // ----------------------------------------------------------- driver app
  static const referralCode = 'KARTHIK7';
  static const List<String> upiApps = ['GPay', 'PhonePe', 'Paytm', 'BHIM'];

  static final DateTime nextDebit = DateTime(2026, 10, 24);

  static SubscriptionPlan plan({PlanStatus status = PlanStatus.trial, VehicleKind vehicle = VehicleKind.bike}) =>
      SubscriptionPlan(
        vehicle: vehicle,
        monthlyPrice: vehicle == VehicleKind.bike ? 2000 : Seed.vehicle(vehicle).subscriptionPrice,
        status: status,
        startedAt: TtClock.today,
        nextDebit: nextDebit,
      );

  static List<PaymentRecord> payments() => [
        PaymentRecord(label: 'Sep 2026', amount: 0, status: PaymentRecordStatus.freeTrial, date: DateTime(2026, 9, 24)),
        PaymentRecord(label: 'Aug 2026', amount: 2000, status: PaymentRecordStatus.paid, date: DateTime(2026, 8, 24)),
      ];

  /// Uploaded by hand: RC and insurance. The licence and selfie are checked in the app with Didit.
  static const List<KycDocument> kycFresh = [
    KycDocument(type: KycDocType.vehicleRc, status: KycStatus.underReview),
    KycDocument(type: KycDocType.insurance, status: KycStatus.notUploaded),
  ];

  static const List<KycDocument> kycAllVerified = [
    KycDocument(type: KycDocType.vehicleRc, status: KycStatus.verified),
    KycDocument(type: KycDocType.insurance, status: KycStatus.verified),
  ];

  static const kycRejectReason = 'Photo is blurry. Please upload a clearer image';

  /// Mon–Sun, total ₹8,940.
  static const List<int> weekEarnings = [1120, 1340, 980, 1560, 1420, 1650, 870];
  static const int weekRides = 86;
  static const int weekOnlineHours = 42;
  static const int lifetimeCommissionSaved = 18400;

  /// Today's figures before the demo adds any rides (D-14: "You kept ₹1,420 today · 14 rides").
  static const int todayEarnings = 1420;
  static const int todayRides = 14;

  static List<EarningsTrip> todayTrips() {
    final d = TtClock.today;
    DateTime t(int h, int m) => DateTime(d.year, d.month, d.day, h, m);
    return [
      EarningsTrip(id: 'e1', time: t(15, 42), from: 'Gandhipuram', to: 'Brookefields', fare: 38, paymentMode: PaymentMode.upi, distanceKm: 4.2, durationMin: 14, passengerName: 'Priya', waitingCharge: 3),
      EarningsTrip(id: 'e2', time: t(14, 55), from: 'Town Hall', to: 'Ukkadam', fare: 32, paymentMode: PaymentMode.cash, distanceKm: 1.4, durationMin: 6, passengerName: 'Suresh'),
      EarningsTrip(id: 'e3', time: t(14, 10), from: 'PSG Tech', to: 'Tidel Park', fare: 64, paymentMode: PaymentMode.upi, distanceKm: 3.4, durationMin: 11, passengerName: 'Anitha'),
      EarningsTrip(id: 'e4', time: t(13, 20), from: 'RS Puram', to: 'Saibaba Colony', fare: 41, paymentMode: PaymentMode.cash, distanceKm: 3.1, durationMin: 10, passengerName: 'Gokul'),
      EarningsTrip(id: 'e5', time: t(12, 5), from: 'Race Course', to: 'Coimbatore Junction', fare: 36, paymentMode: PaymentMode.upi, distanceKm: 2.2, durationMin: 8, passengerName: 'Divya'),
      EarningsTrip(id: 'e6', time: t(11, 30), from: 'Peelamedu', to: 'Prozone Mall', fare: 92, paymentMode: PaymentMode.cash, distanceKm: 7.9, durationMin: 26, passengerName: 'Harish'),
    ];
  }

  /// The ride request shown on D-15.
  static const RideRequest rideRequest = RideRequest(
    id: 'REQ-1',
    kind: TripKind.ride,
    vehicle: VehicleKind.bike,
    fare: 38,
    pickup: gandhipuram,
    drop: brookefields,
    pickupDistanceKm: 0.8,
    pickupEtaMin: 3,
    tripKm: 4.2,
    tripMin: 14,
    customerName: 'Priya',
    customerRating: 4.9,
    customerPhone: '+91 98765 43210',
    otp: rideOtp,
  );

  /// A Sedan rented for 4 hours (D-15 rental card, D-18 / D-19 rental frames). A rental has no drop: the API sets
  /// the drop to the pickup.
  static const RideRequest rentalRequest = RideRequest(
    id: 'REQ-R1',
    kind: TripKind.ride,
    vehicle: VehicleKind.sedan,
    fare: 979,
    pickup: gandhipuram,
    drop: gandhipuram,
    pickupDistanceKm: 1.2,
    pickupEtaMin: 5,
    tripKm: 40,
    tripMin: 240,
    customerName: 'Meena',
    customerRating: 4.8,
    customerPhone: '+91 98765 43211',
    otp: rideOtp,
    rideMode: RideMode.rental,
    modeTerms: RentalTerms(packageId: '4h', hours: 4, km: 40, price: 979, extraKmRate: 14, extraMinRate: 2.5),
  );

  /// A Sedan to Ooty and back, booked for tomorrow 6 am, back the day after at 6 pm (D-15 outstation card).
  static RideRequest get outstationRequest {
    final now = DateTime.now();
    final leave = DateTime(now.year, now.month, now.day + 1, 6);
    final back = DateTime(now.year, now.month, now.day + 2, 18);
    final ooty = outstationTowns[1];
    final terms = RideModeRates.outstationTerms(VehicleKind.sedan, routeKm: 86, roundTrip: true, leaveAt: leave, returnAt: back);
    return RideRequest(
      id: 'REQ-O1',
      kind: TripKind.ride,
      vehicle: VehicleKind.sedan,
      fare: (terms.includedKm * terms.perKm).floor() + terms.allowancePerDay * terms.days,
      pickup: gandhipuram,
      drop: ooty,
      pickupDistanceKm: 2.4,
      pickupEtaMin: 8,
      tripKm: 86,
      tripMin: 150,
      customerName: 'Arun',
      customerRating: 4.9,
      customerPhone: '+91 98765 43212',
      otp: rideOtp,
      rideMode: RideMode.outstation,
      modeTerms: terms,
      scheduledAt: leave,
    );
  }

  /// A 1 BHK house shift booked for tomorrow 9–11 am by pickup truck (D-20c, D-21c, D-19e frames).
  static RideRequest get shiftingRequest {
    final now = DateTime.now();
    final slot = DateTime(now.year, now.month, now.day + 1, 9);
    const details = ShiftingDetails(
      homeSize: HomeSize.oneBhk,
      items: [
        ShiftingItem(name: 'Double cot', note: 'Wooden, comes apart'),
        ShiftingItem(name: 'Fridge', note: 'Single door'),
        ShiftingItem(name: '3-seater sofa'),
        ShiftingItem(name: 'Cartons', qty: 12, note: 'Kitchen things and books'),
        ShiftingItem(name: 'Washing machine', note: 'Top load'),
      ],
      pickupFloor: 2,
      dropFloor: 5,
      dropLift: true,
      packing: PackingLevel.basic,
      dismantlePieces: 1,
    );
    final lines = GoodsModeRates.lines(details, 1236, slot);
    return RideRequest(
      id: 'REQ-H1',
      kind: TripKind.parcel,
      vehicle: VehicleKind.pickup,
      fare: lines.total,
      pickup: peelamedu,
      drop: raceCourse,
      pickupDistanceKm: 1.8,
      pickupEtaMin: 7,
      tripKm: 6.8,
      tripMin: 23,
      customerName: 'Meena Ravi',
      customerRating: 4.8,
      customerPhone: receiverPhone,
      parcel: const ParcelDetails(
        category: ParcelCategory.household,
        weight: WeightBand.over500,
        senderName: 'Meena Ravi',
        senderPhone: receiverPhone,
        receiverName: 'Meena Ravi',
        receiverPhone: receiverPhone,
        deliveryOtp: deliveryOtp,
      ),
      scheduledAt: slot,
      shifting: details.copyWith(lines: lines),
    );
  }

  /// The delivery request shown on D-20.
  static const RideRequest deliveryRequest = RideRequest(
    id: 'REQ-2',
    kind: TripKind.parcel,
    vehicle: VehicleKind.threeWheeler,
    fare: 180,
    pickup: peelamedu,
    drop: raceCourse,
    pickupDistanceKm: 1.1,
    pickupEtaMin: 4,
    tripKm: 6.8,
    tripMin: 23,
    customerName: receiverName,
    customerRating: 4.8,
    customerPhone: receiverPhone,
    otp: deliveryOtp,
    parcel: ParcelDetails(
      category: ParcelCategory.clothes,
      weight: WeightBand.from5to20,
      senderName: 'Priya Raman',
      senderPhone: '+91 98765 43210',
      receiverName: receiverName,
      receiverPhone: receiverPhone,
      payer: ParcelPayer.receiver,
      deliveryOtp: deliveryOtp,
    ),
  );

  /// The driver's own location on the home map.
  static const LatLng driverHome = LatLng(11.0165, 76.9690);

  /// Busy areas for the demo map on D-14 / S-12, drawn as hexes (see `DemandMap.demo`), busiest first.
  static const List<({String name, LatLng centre})> demandZones = [
    (name: 'Gandhipuram', centre: LatLng(11.0183, 76.9725)),
    (name: 'Peelamedu', centre: LatLng(11.0290, 77.0270)),
    (name: 'RS Puram', centre: LatLng(11.0089, 76.9500)),
  ];
}
