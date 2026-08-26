// Seed: Nigerian institutions with their faculties and departments.
// Run: npx ts-node prisma/seed-institutions.ts
//
// Coverage (sourced from NUC / NBTE / NCCE lists via Wikipedia, 2025–2026):
//   • All ~57 federal universities (including the new universities of
//     education, health sciences, agriculture, transportation and applied
//     sciences established 2021–2025).
//   • All ~51 state universities.
//   • All federal + state polytechnics.
//   • All federal + state colleges of education.
//   • A broad set of private universities.
//
// Faculty/school lists are the *standard* sets for each institution type —
// they are accurate for the large comprehensive institutions and a close,
// representative default for newer/smaller ones. Departments are the common
// core per faculty/school. Niche departments and recent changes vary by
// school and can be added/corrected through the admin Institutions page.

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

// ── Faculty / school department templates ─────────────────────────

const DEPARTMENTS: Record<string, string[]> = {
  // ── University faculties ──────────────────────────────────────
  "Agriculture": [
    "Agricultural Economics", "Agronomy", "Animal Science", "Crop Science",
    "Fisheries & Aquaculture", "Forestry & Wildlife", "Soil Science",
  ],
  "Arts": [
    "English & Literary Studies", "History & International Studies",
    "Linguistics", "Philosophy", "Theatre & Performing Arts",
    "Religious Studies", "Modern Languages",
  ],
  "Basic Medical Sciences": [
    "Anatomy", "Biochemistry", "Medical Laboratory Science", "Physiology",
  ],
  "Clinical Sciences": ["Medicine & Surgery"],
  "Dentistry": ["Dentistry"],
  "Education": [
    "Adult Education", "Curriculum & Instruction", "Educational Foundations",
    "Educational Management", "Guidance & Counselling", "Human Kinetics",
    "Library & Information Science",
  ],
  "Engineering": [
    "Agricultural & Bioresources Engineering", "Chemical Engineering",
    "Civil Engineering", "Computer Engineering", "Electrical/Electronic Engineering",
    "Mechanical Engineering", "Metallurgical & Materials Engineering",
    "Petroleum Engineering", "Systems Engineering", "Mechatronics Engineering",
  ],
  "Environmental Sciences": [
    "Architecture", "Building", "Estate Management", "Quantity Surveying",
    "Surveying & Geoinformatics", "Urban & Regional Planning",
  ],
  "Law": ["Law"],
  "Management Sciences": [
    "Accounting", "Banking & Finance", "Business Administration",
    "Entrepreneurship", "Marketing", "Public Administration",
  ],
  "Pharmacy": ["Pharmacy"],
  "Science": [
    "Biochemistry", "Botany", "Chemistry", "Computer Science", "Geology",
    "Industrial Mathematics", "Mathematics", "Microbiology", "Physics",
    "Statistics", "Zoology",
  ],
  "Social Sciences": [
    "Economics", "Geography", "Mass Communication", "Political Science",
    "Psychology", "Sociology", "Social Work",
  ],
  "Veterinary Medicine": ["Veterinary Medicine"],
  "Computing": [
    "Computer Science", "Cyber Security", "Information Technology",
    "Software Engineering", "Data Science",
  ],
  "Health Sciences": [
    "Nursing Science", "Medical Laboratory Science", "Public Health",
    "Physiotherapy", "Radiography",
  ],
  "Sciences": [
    "Biology", "Chemistry", "Physics", "Mathematics", "Computer Science",
    "Integrated Science",
  ],
  // ── Health-sciences universities ───────────────────────────────
  "Allied Health Sciences": [
    "Nursing Science", "Medical Radiography", "Physiotherapy",
    "Medical Laboratory Science", "Public Health",
  ],
  "Nursing": ["Nursing Science"],
  "Public Health": ["Community Health", "Environmental Health"],
  "Health Information Management": ["Health Information Management"],
  // ── Universities of education ─────────────────────────────────
  "Vocational & Technical Education": [
    "Agricultural Education", "Business Education", "Home Economics Education",
    "Technical Education", "Fine & Applied Arts Education",
  ],
  "Languages": ["English", "French", "Hausa", "Yoruba", "Igbo", "Arabic"],
  "Arts & Social Sciences": [
    "English", "History", "Geography", "Economics", "Political Science",
    "Sociology", "Religious Studies", "Fine & Applied Arts",
  ],
  "Science Education": [
    "Biology Education", "Chemistry Education", "Physics Education",
    "Mathematics Education", "Integrated Science", "Computer Science Education",
  ],
  // ── Polytechnic schools ────────────────────────────────────────
  "School of Engineering": [
    "Civil Engineering", "Electrical/Electronic Engineering",
    "Mechanical Engineering", "Computer Engineering", "Chemical Engineering",
    "Agricultural & Bioenvironmental Engineering", "Mining Engineering",
  ],
  "School of Applied Science": [
    "Computer Science", "Statistics", "Science Laboratory Technology",
    "Food Technology", "Mathematics", "Physics with Electronics",
    "Microbiology", "Chemistry", "Biochemistry",
  ],
  "School of Management Studies": [
    "Accountancy", "Business Administration & Management", "Banking & Finance",
    "Marketing", "Public Administration", "Office Technology & Management",
  ],
  "School of Environmental Studies": [
    "Architecture", "Building Technology", "Estate Management",
    "Quantity Surveying", "Surveying & Geoinformatics",
    "Urban & Regional Planning",
  ],
  "School of Communication & Information Technology": [
    "Mass Communication", "Library & Information Science",
    "Computer Science", "Information Technology",
  ],
  "School of Agriculture": [
    "Agricultural Technology", "Animal Production Technology",
    "Crop Production Technology", "Fisheries Technology", "Horticulture",
  ],
  "School of Art, Design & Printing": [
    "Fine Art", "Industrial Design", "Printing Technology",
    "Fashion Design & Clothing Technology", "Graphic Design",
  ],
  // ── College-of-education schools ───────────────────────────────
  "School of Education": [
    "Educational Foundations", "Curriculum Studies", "Educational Psychology",
    "Educational Management", "Guidance & Counselling",
    "Primary Education Studies",
  ],
  "School of Sciences": [
    "Biology", "Chemistry", "Physics", "Mathematics", "Integrated Science",
    "Computer Science", "Physical & Health Education",
  ],
  "School of Languages": [
    "English", "French", "Hausa", "Yoruba", "Igbo", "Arabic",
  ],
  "School of Vocational Education": [
    "Agricultural Education", "Business Education", "Home Economics",
    "Technical Education", "Fine & Applied Arts Education",
  ],
  "School of Early Childhood Education": [
    "Early Childhood Care & Education", "Primary Education Studies",
    "Special Education",
  ],
};

// Faculty/school lists per institution type.
const COMPREHENSIVE = [
  "Agriculture", "Arts", "Basic Medical Sciences", "Clinical Sciences",
  "Dentistry", "Education", "Engineering", "Environmental Sciences",
  "Law", "Management Sciences", "Pharmacy", "Science", "Social Sciences",
  "Veterinary Medicine",
];
const TECHNOLOGY = [
  "Agriculture", "Engineering", "Environmental Sciences",
  "Management Sciences", "Science", "Computing", "Health Sciences",
];
const AGRICULTURE = [
  "Agriculture", "Engineering", "Environmental Sciences",
  "Management Sciences", "Science", "Veterinary Medicine",
];
const HEALTH = [
  "Basic Medical Sciences", "Clinical Sciences", "Dentistry", "Pharmacy",
  "Allied Health Sciences", "Nursing", "Public Health",
  "Health Information Management",
];
const EDUCATION = [
  "Education", "Arts & Social Sciences", "Sciences", "Science Education",
  "Vocational & Technical Education", "Languages",
];
const POLYTECHNIC = [
  "School of Engineering", "School of Applied Science",
  "School of Management Studies", "School of Environmental Studies",
  "School of Communication & Information Technology",
];
const COLLEGE_OF_ED = [
  "School of Education", "School of Sciences", "School of Arts & Social Sciences",
  "School of Languages", "School of Vocational Education",
  "School of Early Childhood Education",
];

// [name, shortName, state, type, facultyKeys]
type InstitutionSeed = [string, string, string, "university" | "polytechnic" | "college_of_education", string[]];

const INSTITUTIONS: InstitutionSeed[] = [
  // ══ Federal universities ═══════════════════════════════════════
  ["University of Ibadan", "UI", "Oyo", "university", COMPREHENSIVE],
  ["University of Lagos", "UNILAG", "Lagos", "university", COMPREHENSIVE],
  ["University of Nigeria, Nsukka", "UNN", "Enugu", "university", COMPREHENSIVE],
  ["Obafemi Awolowo University", "OAU", "Osun", "university", COMPREHENSIVE],
  ["Ahmadu Bello University", "ABU", "Kaduna", "university", COMPREHENSIVE],
  ["University of Benin", "UNIBEN", "Edo", "university", COMPREHENSIVE],
  ["University of Ilorin", "UNILORIN", "Kwara", "university", COMPREHENSIVE],
  ["University of Jos", "UNIJOS", "Plateau", "university", COMPREHENSIVE],
  ["University of Port Harcourt", "UNIPORT", "Rivers", "university", COMPREHENSIVE],
  ["University of Calabar", "UNICAL", "Cross River", "university", COMPREHENSIVE],
  ["University of Maiduguri", "UNIMAID", "Borno", "university", COMPREHENSIVE],
  ["University of Abuja", "UNIABUJA", "FCT", "university", COMPREHENSIVE],
  ["Bayero University Kano", "BUK", "Kano", "university", COMPREHENSIVE],
  ["Usmanu Danfodiyo University, Sokoto", "UDUS", "Sokoto", "university", COMPREHENSIVE],
  ["Nnamdi Azikiwe University", "UNIZIK", "Anambra", "university", COMPREHENSIVE],
  ["University of Uyo", "UNIUYO", "Akwa Ibom", "university", COMPREHENSIVE],
  ["Abubakar Tafawa Balewa University", "ATBU", "Bauchi", "university", TECHNOLOGY],
  ["Modibbo Adama University, Yola", "MAU", "Adamawa", "university", TECHNOLOGY],
  ["Federal University of Technology, Akure", "FUTA", "Ondo", "university", TECHNOLOGY],
  ["Federal University of Technology, Minna", "FUTMINNA", "Niger", "university", TECHNOLOGY],
  ["Federal University of Technology, Owerri", "FUTO", "Imo", "university", TECHNOLOGY],
  ["Federal University of Technology, Ikot Abasi", "FUTIA", "Akwa Ibom", "university", TECHNOLOGY],
  ["Michael Okpara University of Agriculture, Umudike", "MOUAU", "Abia", "university", AGRICULTURE],
  ["Federal University of Agriculture, Abeokuta", "FUNAAB", "Ogun", "university", AGRICULTURE],
  ["Federal University of Agriculture, Mubi", "FUAMB", "Adamawa", "university", AGRICULTURE],
  ["Federal University of Agriculture, Zuru", "FUAZ", "Kebbi", "university", AGRICULTURE],
  ["Joseph Sarwuan Tarka University", "JOSTUM", "Benue", "university", AGRICULTURE],
  ["Federal University of Petroleum Resources, Effurun", "FUPRE", "Delta", "university", TECHNOLOGY],
  ["Federal University of Transportation, Daura", "FUTD", "Katsina", "university", TECHNOLOGY],
  ["Federal University of Applied Sciences, Kachia", "FUASK", "Kaduna", "university", TECHNOLOGY],
  ["Federal University of Health Sciences, Azare", "FUHSA", "Bauchi", "university", HEALTH],
  ["Federal University, Oye-Ekiti", "FUOYE", "Ekiti", "university", COMPREHENSIVE],
  ["Federal University, Dutsin-Ma", "FUDMA", "Katsina", "university", COMPREHENSIVE],
  ["Federal University, Lafia", "FULAFIA", "Nasarawa", "university", COMPREHENSIVE],
  ["Federal University, Lokoja", "FULOKOJA", "Kogi", "university", COMPREHENSIVE],
  ["Federal University, Kashere", "FUKASHERE", "Gombe", "university", COMPREHENSIVE],
  ["Federal University, Wukari", "FUWUKARI", "Taraba", "university", COMPREHENSIVE],
  ["Federal University, Otuoke", "FUOTUOKE", "Bayelsa", "university", COMPREHENSIVE],
  ["Federal University, Birnin Kebbi", "FUBK", "Kebbi", "university", COMPREHENSIVE],
  ["Federal University, Gusau", "FUGUSAU", "Zamfara", "university", COMPREHENSIVE],
  ["Federal University, Gashua", "FUGASHUA", "Yobe", "university", COMPREHENSIVE],
  ["Federal University, Dutse", "FUD", "Jigawa", "university", COMPREHENSIVE],
  ["Alex Ekwueme Federal University, Ndufu-Alike", "AE-FUNAI", "Ebonyi", "university", COMPREHENSIVE],
  ["National Open University of Nigeria", "NOUN", "Lagos", "university", COMPREHENSIVE],
  ["Nigerian Maritime University", "NMU", "Delta", "university", TECHNOLOGY],
  ["Nigerian Army University, Biu", "NAUB", "Borno", "university", COMPREHENSIVE],
  ["Nigerian Defence Academy", "NDA", "Kaduna", "university", TECHNOLOGY],
  ["Air Force Institute of Technology", "AFIT", "Kaduna", "university", TECHNOLOGY],
  ["Nigeria Police Academy, Wudil", "POLAC", "Kano", "university", COMPREHENSIVE],
  ["African Aviation and Aerospace University", "AAAU", "FCT", "university", TECHNOLOGY],
  ["Admiralty University, Ibusa", "ADUN", "Delta", "university", COMPREHENSIVE],
  ["Adeyemi Federal University of Education", "AFUED", "Ondo", "university", EDUCATION],
  ["Alvan Ikoku Federal University of Education", "AIFUE", "Imo", "university", EDUCATION],
  ["Federal University of Education, Pankshin", "FUEP", "Plateau", "university", EDUCATION],
  ["Federal University of Education, Zaria", "FUEZ", "Kaduna", "university", EDUCATION],
  ["Tai Solarin Federal University of Education", "TASFUED", "Ogun", "university", EDUCATION],
  ["Yusuf Maitama Sule Federal University of Education, Kano", "YMSFUEK", "Kano", "university", EDUCATION],

  // ══ State universities ═════════════════════════════════════════
  ["Lagos State University", "LASU", "Lagos", "university", COMPREHENSIVE],
  ["Lagos State University of Education", "LASUED", "Lagos", "university", EDUCATION],
  ["Lagos State University of Science and Technology", "LASUST", "Lagos", "university", TECHNOLOGY],
  ["Ambrose Alli University", "AAU", "Edo", "university", COMPREHENSIVE],
  ["Edo State University, Uzairue", "EDSU", "Edo", "university", COMPREHENSIVE],
  ["Delta State University, Abraka", "DELSU", "Delta", "university", COMPREHENSIVE],
  ["Delta State University of Science and Technology", "DSPZ", "Delta", "university", TECHNOLOGY],
  ["Dennis Osadebay University", "DOU", "Delta", "university", COMPREHENSIVE],
  ["University of Delta", "UNIDEL", "Delta", "university", COMPREHENSIVE],
  ["Ekiti State University", "EKSU", "Ekiti", "university", COMPREHENSIVE],
  ["Enugu State University of Science and Technology", "ESUT", "Enugu", "university", TECHNOLOGY],
  ["Imo State University", "IMSU", "Imo", "university", COMPREHENSIVE],
  ["Kingsley Ozumba Mbadiwe University", "KOMU", "Imo", "university", COMPREHENSIVE],
  ["Kaduna State University", "KASU", "Kaduna", "university", COMPREHENSIVE],
  ["Prince Abubakar Audu University", "PAAU", "Kogi", "university", COMPREHENSIVE],
  ["Niger Delta University", "NDU", "Bayelsa", "university", COMPREHENSIVE],
  ["Bayelsa Medical University", "BMU", "Bayelsa", "university", HEALTH],
  ["Olabisi Onabanjo University", "OOU", "Ogun", "university", COMPREHENSIVE],
  ["Rivers State University", "RSU", "Rivers", "university", COMPREHENSIVE],
  ["Ignatius Ajuru University of Education", "IAUE", "Rivers", "university", EDUCATION],
  ["Nasarawa State University", "NSUK", "Nasarawa", "university", COMPREHENSIVE],
  ["Benue State University", "BSU", "Benue", "university", COMPREHENSIVE],
  ["Gombe State University", "GSU", "Gombe", "university", COMPREHENSIVE],
  ["Gombe State University of Science and Technology", "GSUST", "Gombe", "university", TECHNOLOGY],
  ["Adamawa State University", "ADSU", "Adamawa", "university", COMPREHENSIVE],
  ["Ebonyi State University", "EBSU", "Ebonyi", "university", COMPREHENSIVE],
  ["Abia State University", "ABSU", "Abia", "university", COMPREHENSIVE],
  ["Osun State University", "UNIOSUN", "Osun", "university", COMPREHENSIVE],
  ["Adekunle Ajasin University", "AAUA", "Ondo", "university", COMPREHENSIVE],
  ["Olusegun Agagu University of Science and Technology", "OAUST", "Ondo", "university", TECHNOLOGY],
  ["Ladoke Akintola University of Technology", "LAUTECH", "Oyo", "university", TECHNOLOGY],
  ["Abiola Ajimobi Technical University", "TECH-U", "Oyo", "university", TECHNOLOGY],
  ["Emmanuel Ayande University of Education", "EAUEDOYO", "Oyo", "university", EDUCATION],
  ["Akwa Ibom State University", "AKSU", "Akwa Ibom", "university", COMPREHENSIVE],
  ["Bauchi State University", "BASUG", "Bauchi", "university", COMPREHENSIVE],
  ["Borno State University", "BOSU", "Borno", "university", COMPREHENSIVE],
  ["Chukwuemeka Odumegwu Ojukwu University", "COOU", "Anambra", "university", COMPREHENSIVE],
  ["Ibrahim Badamasi Babangida University", "IBBUL", "Niger", "university", COMPREHENSIVE],
  ["Abdulkadir Kure University", "AKUM", "Niger", "university", COMPREHENSIVE],
  ["Aliko Dangote University of Science and Technology", "ADUSTECH", "Kano", "university", TECHNOLOGY],
  ["Yusuf Maitama Sule University, Kano", "YUMSUK", "Kano", "university", COMPREHENSIVE],
  ["Kebbi State University of Science and Technology", "KSUSTA", "Kebbi", "university", TECHNOLOGY],
  ["Kwara State University", "KWASU", "Kwara", "university", COMPREHENSIVE],
  ["Plateau State University", "PLASU", "Plateau", "university", COMPREHENSIVE],
  ["Sule Lamido University", "SLU", "Jigawa", "university", COMPREHENSIVE],
  ["Taraba State University", "TSU", "Taraba", "university", COMPREHENSIVE],
  ["Umaru Musa Yar'adua University", "UMYU", "Katsina", "university", COMPREHENSIVE],
  ["University of Cross River State", "UNICROSS", "Cross River", "university", COMPREHENSIVE],
  ["Sokoto State University", "SSU", "Sokoto", "university", COMPREHENSIVE],
  ["Yobe State University", "YSU", "Yobe", "university", COMPREHENSIVE],
  ["Zamfara State University", "ZSU", "Zamfara", "university", COMPREHENSIVE],

  // ══ Federal polytechnics ════════════════════════════════════════
  ["Yaba College of Technology", "YABATECH", "Lagos", "polytechnic", POLYTECHNIC],
  ["Auchi Polytechnic", "AUCHIPOLY", "Edo", "polytechnic", POLYTECHNIC],
  ["Akanu Ibiam Federal Polytechnic", "UNWANAPOLY", "Ebonyi", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ado-Ekiti", "FEDPOLYADO", "Ekiti", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ilaro", "FEDPOLYILARO", "Ogun", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Bauchi", "FPTB", "Bauchi", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Bida", "FEDPOLYBIDA", "Niger", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ede", "FEDPOLYEDE", "Osun", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Mubi", "FPMUBI", "Adamawa", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Nekede", "FPNO", "Imo", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Offa", "FEDPOFFA", "Kwara", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Oko", "FEDPOLYOKO", "Anambra", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Nasarawa", "FPN", "Nasarawa", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Idah", "FEPODA", "Kogi", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Kaura-Namoda", "FEDPONAM", "Zamfara", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Damaturu", "FEDPODAM", "Yobe", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Daura", "FEDPOLYDAURA", "Katsina", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ekowe", "FEDPOLYEKOWE", "Bayelsa", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ile-Oluji", "FEDPOLEL", "Ondo", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Kabo", "FEDPOLYKABO", "Kano", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Kaltungo", "FEDPOLYKLT", "Gombe", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ngodo Isuochi", "FEDPOLYNGODO", "Abia", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic of Oil and Gas, Bonny", "FEDPOLYBONNY", "Rivers", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ayede", "FEDPOLYAYEDE", "Oyo", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Bali", "FEDPOLYBALI", "Taraba", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Monguno", "FEDPOLYMONGUNO", "Borno", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Nyak Shendam", "FEDPOLYSHENDAM", "Plateau", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ohodo", "FEDPODO", "Enugu", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Orogun", "FEPO", "Delta", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ugep", "FEDPOLYUGEP", "Cross River", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Ukana", "FEDPOLYUKANA", "Akwa Ibom", "polytechnic", POLYTECHNIC],
  ["Federal Polytechnic, Wannune", "FEDPOLYWANNUNE", "Benue", "polytechnic", POLYTECHNIC],
  ["Hussaini Adamu Federal Polytechnic", "HAFEDPOLY", "Jigawa", "polytechnic", POLYTECHNIC],
  ["Kaduna Polytechnic", "KADPOLY", "Kaduna", "polytechnic", POLYTECHNIC],
  ["Waziri Umaru Federal Polytechnic", "WUFPBK", "Kebbi", "polytechnic", POLYTECHNIC],
  ["Petroleum Training Institute", "PTI", "Delta", "polytechnic", POLYTECHNIC],
  ["Maritime Academy of Nigeria", "MAN", "Akwa Ibom", "polytechnic", POLYTECHNIC],
  ["Nigerian College of Aviation Technology", "NCAT", "Kaduna", "polytechnic", POLYTECHNIC],
  ["National Institute of Construction Technology and Management", "NICTM", "Edo", "polytechnic", POLYTECHNIC],
  ["Nigerian Army College of Environmental Science and Technology", "NACEST", "Benue", "polytechnic", POLYTECHNIC],
  ["Air Force Institute of Technology (Polytechnic)", "AFITPOLY", "Kaduna", "polytechnic", POLYTECHNIC],

  // ══ State polytechnics ══════════════════════════════════════════
  ["Moshood Abiola Polytechnic", "MAPOLY", "Ogun", "polytechnic", POLYTECHNIC],
  ["The Polytechnic, Ibadan", "POLYIBADAN", "Oyo", "polytechnic", POLYTECHNIC],
  ["The Oke-Ogun Polytechnic", "TOPS", "Oyo", "polytechnic", POLYTECHNIC],
  ["Adeseun Ogundoyin Polytechnic", "AOPE", "Oyo", "polytechnic", POLYTECHNIC],
  ["Abraham Adesanya Polytechnic", "AAPOLY", "Ogun", "polytechnic", POLYTECHNIC],
  ["Gateway Polytechnic, Saapade", "GAPOSA", "Ogun", "polytechnic", POLYTECHNIC],
  ["Ogun State Institute of Technology", "OGITECH", "Ogun", "polytechnic", POLYTECHNIC],
  ["Rufus Giwa Polytechnic", "RUGIPO", "Ondo", "polytechnic", POLYTECHNIC],
  ["Osun State Polytechnic", "OSPOLY", "Osun", "polytechnic", POLYTECHNIC],
  ["Osun State College of Technology", "OSCOTECH", "Osun", "polytechnic", POLYTECHNIC],
  ["The Polytechnic, Iresi", "POLYIRESI", "Osun", "polytechnic", POLYTECHNIC],
  ["Abia State Polytechnic", "ABIAPOLY", "Abia", "polytechnic", POLYTECHNIC],
  ["Akwa Ibom State Polytechnic", "AKWAIBOMPOLY", "Akwa Ibom", "polytechnic", POLYTECHNIC],
  ["Anambra State Polytechnic", "ANSPOLY", "Anambra", "polytechnic", POLYTECHNIC],
  ["Bayelsa State Polytechnic", "BAYELSASTATE", "Bayelsa", "polytechnic", POLYTECHNIC],
  ["Benue State Polytechnic", "BENPOLY", "Benue", "polytechnic", POLYTECHNIC],
  ["Akawe Torkula Polytechnic", "AKAWETORKULA", "Benue", "polytechnic", POLYTECHNIC],
  ["Delta State Polytechnic, Ogwashi-Uku", "DSPG", "Delta", "polytechnic", POLYTECHNIC],
  ["Delta State Polytechnic, Otefe-Oghara", "OGHARAPOLY", "Delta", "polytechnic", POLYTECHNIC],
  ["Delta State Maritime Polytechnic", "DSMT", "Delta", "polytechnic", POLYTECHNIC],
  ["Edo State Polytechnic, Usen", "EDOPOLY", "Edo", "polytechnic", POLYTECHNIC],
  ["Institute of Management and Technology, Enugu", "IMT", "Enugu", "polytechnic", POLYTECHNIC],
  ["Imo State Polytechnic", "IMOPOLY", "Imo", "polytechnic", POLYTECHNIC],
  ["Kano State Polytechnic", "KANOPOLY", "Kano", "polytechnic", POLYTECHNIC],
  ["Hassan Usman Katsina Polytechnic", "HUKPOLY", "Katsina", "polytechnic", POLYTECHNIC],
  ["Katsina Institute of Technology and Management", "KSITM", "Katsina", "polytechnic", POLYTECHNIC],
  ["Kebbi State Polytechnic", "KESPODAK", "Kebbi", "polytechnic", POLYTECHNIC],
  ["Kenule Beeson Saro-Wiwa Polytechnic", "KENPOLY", "Rivers", "polytechnic", POLYTECHNIC],
  ["Captain Elechi Amadi Polytechnic", "CEAPOLY", "Rivers", "polytechnic", POLYTECHNIC],
  ["Kogi State Polytechnic", "KOGIPOLY", "Kogi", "polytechnic", POLYTECHNIC],
  ["Kwara State Polytechnic", "KWARAPOLY", "Kwara", "polytechnic", POLYTECHNIC],
  ["Niger State Polytechnic", "NIGERPOLY", "Niger", "polytechnic", POLYTECHNIC],
  ["Isa Mustapha Agwai Polytechnic, Lafia", "IMAP", "Nasarawa", "polytechnic", POLYTECHNIC],
  ["Nuhu Bamalli Polytechnic", "NUBAPOLY", "Kaduna", "polytechnic", POLYTECHNIC],
  ["Plateau State Polytechnic", "PLAPOLY", "Plateau", "polytechnic", POLYTECHNIC],
  ["Ramat Polytechnic", "RAMATPOLY", "Borno", "polytechnic", POLYTECHNIC],
  ["Taraba State Polytechnic", "TARABAPOLY", "Taraba", "polytechnic", POLYTECHNIC],
  ["Umaru Ali Shinkafi Polytechnic", "UASP", "Sokoto", "polytechnic", POLYTECHNIC],
  ["Abdu Gusau Polytechnic", "AGPMAFARA", "Zamfara", "polytechnic", POLYTECHNIC],
  ["Abubakar Tatari Polytechnic", "ATAPOLY", "Bauchi", "polytechnic", POLYTECHNIC],
  ["Adamawa State Polytechnic", "ADAMAWAPOLY", "Adamawa", "polytechnic", POLYTECHNIC],
  ["Binyamu Usman Polytechnic", "BUPOLY", "Jigawa", "polytechnic", POLYTECHNIC],
  ["Jigawa State Polytechnic", "JIGPOLY", "Jigawa", "polytechnic", POLYTECHNIC],
  ["Mai-Idris Alooma Polytechnic", "MIAPOLY", "Yobe", "polytechnic", POLYTECHNIC],
  ["College of Administration, Management and Technology", "CAMTECH", "Yobe", "polytechnic", POLYTECHNIC],
  ["Cross River Institute of Technology and Management", "CRITM", "Cross River", "polytechnic", POLYTECHNIC],

  // ══ Federal colleges of education ═══════════════════════════════
  ["Adeyemi College of Education", "ACE", "Ondo", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Special), Oyo", "FCESOYO", "Oyo", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Iwo", "FCEIWO", "Osun", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Ididep", "FCEIDIDEP", "Akwa Ibom", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Asaba", "FCETASABA", "Delta", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Abeokuta", "FCEABEOKUTA", "Ogun", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Kano", "FCEKANO", "Kano", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Eha-Amufu", "FCEEHAAMUFU", "Enugu", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Okene", "FCEOKENE", "Kogi", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Gombe", "FCETGOMBE", "Gombe", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Omoku", "FCETOMOKU", "Rivers", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Kontagora", "FCEKONTAGORA", "Niger", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Zaria", "FCEZARIA", "Kaduna", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Pankshin", "FCEPANKSHIN", "Plateau", "college_of_education", COLLEGE_OF_ED],
  ["Alvan Ikoku Federal College of Education", "AIFCE", "Imo", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Yola", "FCEYOLA", "Adamawa", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Potiskum", "FCETPOTISKUM", "Yobe", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Gusau", "FCETGUSAU", "Zamfara", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Akoka", "FCETAKOKA", "Lagos", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Katsina", "FCEKATSINA", "Katsina", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Bichi", "FCETBICHI", "Kano", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education, Obudu", "FCEOBUDU", "Cross River", "college_of_education", COLLEGE_OF_ED],
  ["Federal College of Education (Technical), Umunze", "FCETUMUNZE", "Anambra", "college_of_education", COLLEGE_OF_ED],

  // ══ State colleges of education ═════════════════════════════════
  ["Abia State College of Education (Technical)", "ASCETA", "Abia", "college_of_education", COLLEGE_OF_ED],
  ["Adamawa State College of Education", "ADSCOE", "Adamawa", "college_of_education", COLLEGE_OF_ED],
  ["Adeniran Ogunsanya College of Education", "AOCOED", "Lagos", "college_of_education", COLLEGE_OF_ED],
  ["Michael Otedola College of Primary Education", "MOCPED", "Lagos", "college_of_education", COLLEGE_OF_ED],
  ["Akwa Ibom State College of Education", "AKSCOE", "Akwa Ibom", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Akamkpa", "COEAKAMKPA", "Cross River", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Akwanga", "COEAKWANGA", "Nasarawa", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Billiri", "COEBILLIRI", "Gombe", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Ekiadolor", "COEEKIADOLOR", "Edo", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Gindiri", "COEGINDIRI", "Plateau", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Katsina-Ala", "COEKATSINAALA", "Benue", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Lanlate", "COELANLATE", "Oyo", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Oju", "COEOJU", "Benue", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Warri", "COEWARRI", "Delta", "college_of_education", COLLEGE_OF_ED],
  ["Ebonyi State College of Education", "EBSCOE", "Ebonyi", "college_of_education", COLLEGE_OF_ED],
  ["Enugu State College of Education (Technical)", "ESCET", "Enugu", "college_of_education", COLLEGE_OF_ED],
  ["FCT College of Education", "FCTCOE", "FCT", "college_of_education", COLLEGE_OF_ED],
  ["Imo State College of Education", "IMSCOE", "Imo", "college_of_education", COLLEGE_OF_ED],
  ["Isa Kaita College of Education", "IKCOE", "Katsina", "college_of_education", COLLEGE_OF_ED],
  ["Jigawa State College of Education", "JISCOE", "Jigawa", "college_of_education", COLLEGE_OF_ED],
  ["Kano State College of Education and Preliminary Studies", "KASCEPS", "Kano", "college_of_education", COLLEGE_OF_ED],
  ["Kaduna State College of Education", "KASCOE", "Kaduna", "college_of_education", COLLEGE_OF_ED],
  ["Kashim Ibrahim College of Education", "KICOE", "Borno", "college_of_education", COLLEGE_OF_ED],
  ["Kogi State College of Education, Ankpa", "KSCOEANKPA", "Kogi", "college_of_education", COLLEGE_OF_ED],
  ["Kogi State College of Education (Technical), Kabba", "KSCOETKABBA", "Kogi", "college_of_education", COLLEGE_OF_ED],
  ["Kwara State College of Education, Ilorin", "KWCOEILORIN", "Kwara", "college_of_education", COLLEGE_OF_ED],
  ["Kwara State College of Education (Technical), Lafiagi", "KWCOETLAFIAGI", "Kwara", "college_of_education", COLLEGE_OF_ED],
  ["Kwara State College of Education, Oro", "COEORO", "Kwara", "college_of_education", COLLEGE_OF_ED],
  ["Niger State College of Education", "NISCOE", "Niger", "college_of_education", COLLEGE_OF_ED],
  ["Nwafor Orizu College of Education", "NOCEN", "Anambra", "college_of_education", COLLEGE_OF_ED],
  ["Osun State College of Education, Ilesa", "OSCOEILESA", "Osun", "college_of_education", COLLEGE_OF_ED],
  ["Sa'adatu Rimi College of Education", "SRCOE", "Kano", "college_of_education", COLLEGE_OF_ED],
  ["Shehu Shagari College of Education", "SSCOE", "Sokoto", "college_of_education", COLLEGE_OF_ED],
  ["Umar Suleiman College of Education", "USCOE", "Yobe", "college_of_education", COLLEGE_OF_ED],
  ["Zamfara State College of Education", "ZAMCOE", "Zamfara", "college_of_education", COLLEGE_OF_ED],
  ["Adamu Augie College of Education", "AACOE", "Kebbi", "college_of_education", COLLEGE_OF_ED],
  ["Adamu Tafawa Balewa College of Education", "ATBCOE", "Bauchi", "college_of_education", COLLEGE_OF_ED],
  ["Aminu Saleh College of Education", "ASCOE", "Bauchi", "college_of_education", COLLEGE_OF_ED],
  ["Bilyaminu Othman College of Education", "BOCOE", "Bauchi", "college_of_education", COLLEGE_OF_ED],
  ["A.D. Rufa'i College of Education, Legal and General Studies", "ADRCOE", "Kano", "college_of_education", COLLEGE_OF_ED],
  ["College of Education and Legal Studies, Nguru", "COELS", "Yobe", "college_of_education", COLLEGE_OF_ED],
  ["College of Education, Waka-Biu", "COEWAKABIU", "Borno", "college_of_education", COLLEGE_OF_ED],
  ["Mohammed Goni College of Legal and Islamic Studies", "MOGCOLIS", "Borno", "college_of_education", COLLEGE_OF_ED],
  ["Yusuf Bala Usman College of Legal and General Studies", "YBUC", "Katsina", "college_of_education", COLLEGE_OF_ED],
  ["Jigawa State College of Education and Legal Studies", "JISCOELS", "Jigawa", "college_of_education", COLLEGE_OF_ED],

  // ══ Private universities (major) ════════════════════════════════
  ["Covenant University", "CU", "Ogun", "university", COMPREHENSIVE],
  ["Babcock University", "BU", "Ogun", "university", COMPREHENSIVE],
  ["Afe Babalola University", "ABUAD", "Ekiti", "university", COMPREHENSIVE],
  ["Bowen University", "BOWEN", "Osun", "university", COMPREHENSIVE],
  ["Igbinedion University", "IUO", "Edo", "university", COMPREHENSIVE],
  ["Madonna University", "MADONNA", "Rivers", "university", COMPREHENSIVE],
  ["Lead City University", "LCU", "Oyo", "university", COMPREHENSIVE],
  ["Redeemer's University", "RUN", "Osun", "university", COMPREHENSIVE],
  ["Pan-Atlantic University", "PAU", "Lagos", "university", COMPREHENSIVE],
  ["Nile University of Nigeria", "NUN", "FCT", "university", COMPREHENSIVE],
  ["Bells University of Technology", "BUT", "Ogun", "university", TECHNOLOGY],
  ["Bingham University", "BHU", "Nasarawa", "university", COMPREHENSIVE],
  ["Caleb University", "CALEB", "Lagos", "university", COMPREHENSIVE],
  ["American University of Nigeria", "AUN", "Adamawa", "university", COMPREHENSIVE],
  ["Adeleke University", "ADELEKE", "Osun", "university", COMPREHENSIVE],
  ["Ajayi Crowther University", "ACU", "Oyo", "university", COMPREHENSIVE],
  ["Baze University", "BAZE", "FCT", "university", COMPREHENSIVE],
  ["Benson Idahosa University", "BIU", "Edo", "university", COMPREHENSIVE],
  ["Al-Hikmah University", "AHU", "Kwara", "university", COMPREHENSIVE],
  ["Landmark University", "LU", "Kwara", "university", COMPREHENSIVE],
  ["Elizade University", "ELIZADE", "Ondo", "university", COMPREHENSIVE],
  ["Fountain University", "FUO", "Osun", "university", COMPREHENSIVE],
  ["Achievers University", "ACHIEVERS", "Ondo", "university", COMPREHENSIVE],
  ["Joseph Ayo Babalola University", "JABU", "Osun", "university", COMPREHENSIVE],
  ["Mountain Top University", "MTU", "Ogun", "university", COMPREHENSIVE],
  ["Godfrey Okoye University", "GOU", "Enugu", "university", COMPREHENSIVE],
  ["Veritas University", "VUNA", "FCT", "university", COMPREHENSIVE],
  ["Wesley University", "WUO", "Ondo", "university", COMPREHENSIVE],
  ["Crawford University", "CRAWFORD", "Ogun", "university", COMPREHENSIVE],
  ["Crescent University", "CRESCENT", "Ogun", "university", COMPREHENSIVE],
  ["Christopher University", "CHRISTOPHER", "Ogun", "university", COMPREHENSIVE],
  ["Chrisland University", "CHRISLAND", "Ogun", "university", COMPREHENSIVE],
  ["Anchor University", "ANCHOR", "Lagos", "university", COMPREHENSIVE],
  ["Gregory University", "GREGORY", "Abia", "university", COMPREHENSIVE],
  ["Rhema University", "RHEMA", "Abia", "university", COMPREHENSIVE],
  ["Novena University", "NOVENA", "Delta", "university", COMPREHENSIVE],
  ["Western Delta University", "WDU", "Delta", "university", COMPREHENSIVE],
  ["McPherson University", "MCU", "Ogun", "university", COMPREHENSIVE],
  ["Kings University", "KINGS", "Osun", "university", COMPREHENSIVE],
  ["Ritman University", "RITMAN", "Akwa Ibom", "university", COMPREHENSIVE],
  ["Obong University", "OBONG", "Akwa Ibom", "university", COMPREHENSIVE],
  ["Salem University", "SALEM", "Kogi", "university", COMPREHENSIVE],
  ["Kwararafa University", "KWARARAFA", "Taraba", "university", COMPREHENSIVE],
  ["Caritas University", "CARITAS", "Enugu", "university", COMPREHENSIVE],
  ["Coal City University", "COALCITY", "Enugu", "university", COMPREHENSIVE],
  ["Paul University", "PAUL", "Anambra", "university", COMPREHENSIVE],
  ["Samuel Adegboyega University", "SAU", "Edo", "university", COMPREHENSIVE],
  ["Oduduwa University", "OUI", "Osun", "university", COMPREHENSIVE],
  ["Precious Cornerstone University", "PCU", "Oyo", "university", COMPREHENSIVE],
  ["Dominican University", "DUI", "Oyo", "university", COMPREHENSIVE],
  ["Koladaisi University", "KOLADAISI", "Oyo", "university", COMPREHENSIVE],
  ["Summit University", "SUMMIT", "Kwara", "university", COMPREHENSIVE],
  ["University of Mkar", "UMKAR", "Benue", "university", COMPREHENSIVE],
  ["Edwin Clark University", "ECU", "Delta", "university", COMPREHENSIVE],
  ["Michael and Cecilia Ibru University", "MCIU", "Delta", "university", COMPREHENSIVE],
  ["Hezekiah University", "HEZEKIAH", "Imo", "university", COMPREHENSIVE],
  ["Khadija University", "KHADIJA", "Jigawa", "university", COMPREHENSIVE],
  ["Al-Qalam University", "AUK", "Katsina", "university", COMPREHENSIVE],
  ["Skyline University", "SKYLINE", "Kano", "university", COMPREHENSIVE],
  ["Mewar University", "MEWAR", "Nasarawa", "university", COMPREHENSIVE],
  ["Ave Maria University", "AVEMARIA", "Nasarawa", "university", COMPREHENSIVE],
  ["Arthur Jarvis University", "ARTHURJARVIS", "Cross River", "university", COMPREHENSIVE],
  ["Ahman Pategi University", "APU", "Kwara", "university", COMPREHENSIVE],
  ["Al-Ansar University", "ALANSAR", "Borno", "university", COMPREHENSIVE],
  ["Mudiame University", "MUDIAME", "Edo", "university", COMPREHENSIVE],
  ["PAMO University of Medical Sciences", "PAMO", "Rivers", "university", HEALTH],
  ["African University of Science and Technology", "AUST", "FCT", "university", TECHNOLOGY],
  ["Nigerian University of Technology and Management", "NUTM", "Lagos", "university", TECHNOLOGY],
];

async function main() {
  let institutions = 0;
  let faculties = 0;
  let departments = 0;

  for (const [name, shortName, state, type, facultyKeys] of INSTITUTIONS) {
    const institution = await prisma.institution.upsert({
      where: { name },
      update: { shortName, state, type },
      create: { name, shortName, state, type },
    });
    institutions += 1;

    for (const key of facultyKeys) {
      const departmentsList = DEPARTMENTS[key] ?? [];
      const faculty = await prisma.faculty.upsert({
        where: { institutionId_name: { institutionId: institution.id, name: key } },
        update: {},
        create: { institutionId: institution.id, name: key },
      });
      faculties += 1;

      for (const dep of departmentsList) {
        await prisma.department.upsert({
          where: { facultyId_name: { facultyId: faculty.id, name: dep } },
          update: {},
          create: { facultyId: faculty.id, name: dep },
        });
        departments += 1;
      }
    }
  }

  console.log(
    `Seeded ${institutions} institutions, ${faculties} faculties, ${departments} departments.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
