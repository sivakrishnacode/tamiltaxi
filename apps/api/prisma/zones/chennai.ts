// Chennai's starting zones for `seed-zones.ts`: transport hubs and stations as pickup points, IT parks, shopping and
// crowded areas as demand. Points from OpenStreetMap (© OpenStreetMap contributors, ODbL), looked up 10 Nov 2026;
// metro: the 41 Phase 1 stations (Blue and Green lines), those inside a hub or station zone left to it. No surge or
// no-service zones: those change fares and service, so admins add them. Order matters: a hex an earlier zone of the
// same kind has stays with it.
import type { ZoneSeed } from '../seed-zones.js';

/** Hubs: the owner's size (res 9, one ring ≈ 1 km across). */
const hub = (name: string, ...at: [number, number][]): ZoneSeed => ({ name, kind: 'PICKUP_POINT', res: 9, rings: 1, at });
/** A railway station or bus stand: res 10, two rings (≈ 600 m across, for long platforms). */
const station = (name: string, ...at: [number, number][]): ZoneSeed => ({ name, kind: 'PICKUP_POINT', res: 10, rings: 2, at });
/** A metro station: res 10, one ring (≈ 370 m across), so neighbouring stations stay apart. */
const metro = (name: string, lat: number, lng: number): ZoneSeed => ({ name: `${name} metro`, kind: 'PICKUP_POINT', res: 10, rings: 1, at: [[lat, lng]] });
/** A demand area: res 9, one ring around each point (≈ 1 km across each), like the owner's demand zones. */
const demand = (name: string, ...at: [number, number][]): ZoneSeed => ({ name, kind: 'DEMAND', res: 9, rings: 1, at });

export const ZONES: readonly ZoneSeed[] = [
  // Transport hubs (pickup points; a meeting spot can be added in the admin).
  hub('Airport', [12.98383, 80.16658], [12.9828, 80.1643], [12.98124, 80.16], [12.98081, 80.1642]), // T1, T2, T4, metro
  hub('Chennai Central', [13.08242, 80.27596], [13.08173, 80.27392], [13.08317, 80.27404], [13.08075, 80.27309]), // + metro, suburban, Park
  hub('Egmore station', [13.07775, 80.26126], [13.08028, 80.26305]), // + metro
  hub('Koyambedu CMBT', [13.06704, 80.20565], [13.06852, 80.20398]), // + CMBT metro
  hub('Kilambakkam bus stand (KCBT)', [12.87229, 80.08214], [12.87316, 80.07908], [12.87436, 80.07652]), // + MTC, railway
  hub('Tambaram station', [12.92579, 80.11792], [12.92772, 80.11874]), // + bus stand
  hub('Madhavaram bus stand', [13.1461, 80.2217]),
  hub('Broadway bus stand', [13.08692, 80.28417], [13.08727, 80.28498]), // + High Court metro

  // Railway stations (suburban and MRTS), with the metro or bus stand next to them.
  station('Chennai Beach station', [13.09159, 80.29183]),
  station('Guindy station', [13.00867, 80.21261], [13.00927, 80.21308], [13.00906, 80.21079]), // + metro, bus stand
  station('St. Thomas Mount station', [12.99477, 80.19937], [12.99504, 80.19837], [12.99526, 80.19893]), // + metro, MRTS
  station('Saidapet station', [13.02331, 80.22372], [13.024, 80.22812]), // + metro
  station('Meenambakkam station', [12.9847, 80.17509], [12.98767, 80.17648]), // + metro
  station('Washermanpet station', [13.10887, 80.282], [13.10785, 80.28095]), // + metro
  station('Mambalam station', [13.03807, 80.22778]),
  station('Kodambakkam station', [13.05166, 80.23069]),
  station('Nungambakkam station', [13.06584, 80.23284]),
  station('Perambur station', [13.10772, 80.24441]),
  station('Villivakkam station', [13.11032, 80.20915]),
  station('Ambattur station', [13.11409, 80.15286]),
  station('Avadi station', [13.11827, 80.10154], [13.12005, 80.10212]), // + bus stand
  station('Tiruvottiyur station', [13.15961, 80.29662]),
  station('Velachery station', [12.96762, 80.21951]),
  station('Thiruvanmiyur station', [12.98898, 80.25159]),
  station('Pallavaram station', [12.96757, 80.15205], [12.96891, 80.14962]), // + bus stand
  station('Chromepet station', [12.95219, 80.14117], [12.95135, 80.14057]), // + bus stand

  // Bus stands.
  station('T. Nagar bus stand', [13.03456, 80.23008]),
  station('Vadapalani bus stand', [13.04919, 80.20709]),
  station('Thiruvanmiyur bus stand', [12.98684, 80.25933]),
  station('Poonamallee bus stand', [13.05116, 80.09495]),
  station('Red Hills bus stand', [13.19294, 80.18399]),
  station('Kelambakkam bus stand', [12.78625, 80.22201]),

  // Metro, Blue line (north to south).
  metro('Wimco Nagar Depot', 13.18397, 80.30899),
  metro('Wimco Nagar', 13.17929, 80.30734),
  metro('Thiruvottiyur', 13.1718, 80.30527),
  metro('Thiruvottiyur Theradi', 13.16022, 80.30245),
  metro('Kaladipet', 13.15067, 80.29939),
  metro('Tollgate', 13.14313, 80.29633),
  metro('New Washermanpet', 13.13452, 80.293),
  metro('Tondiarpet', 13.12453, 80.28886),
  metro('Sir Theagaraya College', 13.11575, 80.28474),
  metro('Mannadi', 13.09545, 80.28613),
  metro('Government Estate', 13.06963, 80.27304),
  metro('LIC', 13.06437, 80.26585),
  metro('Thousand Lights', 13.05852, 80.25878),
  metro('AG-DMS', 13.04589, 80.24828),
  metro('Teynampet', 13.0368, 80.24642),
  metro('Nandanam', 13.03171, 80.2412),
  metro('Little Mount', 13.01466, 80.22417),
  metro('Alandur', 13.00426, 80.20145),
  metro('Nanganallur Road', 12.99988, 80.19401),
  // Metro, Green line (east to south-west).
  metro('Nehru Park', 13.07878, 80.25047),
  metro('Kilpauk', 13.07764, 80.24262),
  metro("Pachaiyappa's College", 13.07555, 80.23285),
  metro('Shenoy Nagar', 13.07895, 80.2252),
  metro('Anna Nagar East', 13.08466, 80.21911),
  metro('Anna Nagar Tower', 13.08514, 80.2086),
  metro('Thirumangalam', 13.08528, 80.20152),
  metro('Koyambedu', 13.07345, 80.19484),
  metro('Arumbakkam', 13.06167, 80.21166),
  metro('Vadapalani', 13.05094, 80.21206),
  metro('Ashok Nagar', 13.03548, 80.21111),
  metro('Ekkattuthangal', 13.01692, 80.20542),

  // IT parks.
  demand('Taramani IT parks (Tidel, Ramanujan)', [12.98969, 80.24935], [12.99091, 80.24761], [12.98463, 80.24607], [12.98202, 80.24823]),
  demand('Perungudi IT parks (RMZ, WTC)', [12.97303, 80.24337], [12.96958, 80.24412], [12.96179, 80.24474]),
  demand('Thoraipakkam IT parks (Chennai One)', [12.94727, 80.23198], [12.95091, 80.24071], [12.93946, 80.23477]),
  demand('Sholinganallur IT parks (ELCOT)', [12.90841, 80.22106], [12.9122, 80.22755], [12.90636, 80.22646], [12.90101, 80.22792]),
  demand('Navalur (Vivira, Marina Mall)', [12.85044, 80.22559], [12.84356, 80.22512], [12.83595, 80.22958]),
  { name: 'SIPCOT IT Park, Siruseri', kind: 'DEMAND', res: 9, rings: 2, at: [[12.82684, 80.21884]] },
  demand('Guindy Industrial Estate (Olympia)', [13.01487, 80.20362], [13.01495, 80.20744], [13.02292, 80.20713], [13.01696, 80.21539]),
  demand('DLF IT Park, Manapakkam', [13.02218, 80.17523]),
  demand('Ambattur Industrial Estate (IT parks)', [13.09487, 80.16866], [13.09629, 80.16588], [13.09191, 80.16179]),
  demand('Radial Road IT parks (ITPC, Embassy)', [12.95543, 80.16697], [12.9558, 80.1617]),
  demand('Zoho, Estancia', [12.82839, 80.05115]),
  demand('Tidel Park, Pattabiram', [13.12464, 80.06106]),

  // Shopping.
  demand('T. Nagar (Ranganathan St, Pondy Bazaar)', [13.03752, 80.22971], [13.04078, 80.23765], [13.04298, 80.2334]),
  demand('Phoenix Marketcity, Velachery', [12.99153, 80.21668]),
  demand('Velachery (Grand Square)', [12.97195, 80.22034], [12.97726, 80.22092]),
  demand('Express Avenue & Spencer Plaza', [13.05865, 80.26419], [13.06164, 80.26109]),
  demand('VR Mall, Anna Nagar', [13.08108, 80.19659]),
  demand('Vadapalani (Vijaya Mall, Murugan temple)', [13.05084, 80.20958], [13.05297, 80.21391]),
  demand('Ampa Skywalk, Aminjikarai', [13.07348, 80.22155]),

  // Crowded areas.
  demand("Parry's Corner & George Town", [13.08955, 80.28806], [13.09115, 80.29139], [13.0885, 80.27831], [13.09209, 80.28224]),
  demand('Purasawalkam', [13.08933, 80.25503]),
  demand('Anna Nagar', [13.08825, 80.20734]),
  demand('Mylapore (Kapaleeshwarar temple)', [13.03344, 80.26914], [13.03165, 80.27002]),
  demand('Nungambakkam', [13.06206, 80.24049]),
  demand('Adyar', [13.00645, 80.25778]),
  demand("Besant Nagar (Elliot's Beach)", [12.99789, 80.27303], [12.99969, 80.26823]),
  demand('Marina Beach', [13.05258, 80.28484], [13.0534, 80.28333], [13.06316, 80.28581]),
  demand('Koyambedu market', [13.07041, 80.19324], [13.0681, 80.19843]),
  demand('Porur', [13.03587, 80.15675], [13.03246, 80.15829]),
  demand('Medavakkam', [12.92021, 80.18722]),

  // Big hospitals and colleges.
  demand('Government General Hospital', [13.0809, 80.27733]),
  demand('Apollo Hospitals, Greams Road', [13.06307, 80.25188]),
  demand('Kilpauk Medical College Hospital', [13.07832, 80.24375]),
  demand('Stanley Hospital', [13.10618, 80.2868]),
  demand('MIOT Hospital', [13.02118, 80.18584]),
  demand('Sri Ramachandra Hospital, Porur', [13.0381, 80.1428]),
  demand('IIT Madras & Anna University', [13.0064, 80.2426], [13.01058, 80.23537]),
];
