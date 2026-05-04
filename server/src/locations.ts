export interface Location {
  name: string;
  roles: string[];
}

export const LOCATIONS: Location[] = [
  { name: "Airplane", roles: ["Pilot", "Flight Attendant", "Air Marshal", "Mechanic", "Passenger"] },
  { name: "Bank", roles: ["Manager", "Teller", "Security Guard", "Customer", "Armored Car Driver"] },
  { name: "Beach", roles: ["Lifeguard", "Surfer", "Tourist", "Ice Cream Vendor", "Photographer"] },
  { name: "Casino", roles: ["Dealer", "Bouncer", "Gambler", "Bartender", "Manager"] },
  { name: "Cathedral", roles: ["Priest", "Choir Singer", "Tourist", "Organist", "Bell Ringer"] },
  { name: "Circus Tent", roles: ["Acrobat", "Clown", "Lion Tamer", "Magician", "Ringmaster"] },
  { name: "Corporate Party", roles: ["CEO", "Intern", "Caterer", "DJ", "Accountant"] },
  { name: "Day Spa", roles: ["Masseuse", "Receptionist", "Customer", "Manicurist", "Manager"] },
  { name: "Embassy", roles: ["Ambassador", "Security Officer", "Translator", "Tourist", "Government Official"] },
  { name: "Hospital", roles: ["Doctor", "Nurse", "Patient", "Surgeon", "Anesthesiologist"] },
  { name: "Hotel", roles: ["Receptionist", "Bellhop", "Concierge", "Housekeeper", "Guest"] },
  { name: "Military Base", roles: ["Sergeant", "Soldier", "Sniper", "Medic", "General"] },
  { name: "Movie Studio", roles: ["Director", "Actor", "Camera Operator", "Stuntman", "Producer"] },
  { name: "Ocean Liner", roles: ["Captain", "Bartender", "Musician", "Cook", "Passenger"] },
  { name: "Passenger Train", roles: ["Conductor", "Passenger", "Engineer", "Restaurant Chef", "Stowaway"] },
  { name: "Pirate Ship", roles: ["Captain", "First Mate", "Cook", "Cannoneer", "Cabin Boy"] },
  { name: "Polar Station", roles: ["Researcher", "Geologist", "Biologist", "Cook", "Radio Operator"] },
  { name: "Police Station", roles: ["Detective", "Officer", "Suspect", "Lawyer", "Forensic Analyst"] },
  { name: "Restaurant", roles: ["Chef", "Waiter", "Customer", "Bartender", "Manager"] },
  { name: "School", roles: ["Teacher", "Principal", "Student", "Janitor", "Librarian"] },
  { name: "Service Station", roles: ["Mechanic", "Customer", "Cashier", "Truck Driver", "Manager"] },
  { name: "Space Station", roles: ["Astronaut", "Engineer", "Scientist", "Commander", "Tourist"] },
  { name: "Submarine", roles: ["Captain", "Sonar Operator", "Cook", "Engineer", "Sailor"] },
  { name: "Supermarket", roles: ["Cashier", "Stocker", "Customer", "Manager", "Butcher"] },
  { name: "Theater", roles: ["Actor", "Director", "Audience", "Usher", "Stagehand"] },
  { name: "University", roles: ["Professor", "Student", "Dean", "Janitor", "Researcher"] },
  { name: "Subway", roles: ["Driver", "Passenger", "Busker", "Police Officer", "Pickpocket"] },
  { name: "Wedding", roles: ["Bride", "Groom", "Officiant", "Photographer", "Guest"] },
];

export function pickRandomLocation(): Location {
  return LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
}

export const ALL_LOCATION_NAMES = LOCATIONS.map((l) => l.name);
