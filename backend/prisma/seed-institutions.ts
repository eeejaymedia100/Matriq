// Seed: Nigerian institutions with their faculties and departments.
// Run: npx ts-node prisma/seed-institutions.ts
//
// The dataset is comprehensive for federal universities + major state
// universities (the standard faculty/department set), plus a handful of
// polytechnics and colleges of education. Institution, faculty and
// department lists are extensible at runtime through the admin dashboard,
// so any school not listed here (or whose list has changed) can be added
// or corrected there.

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

// ── Standard faculty/department templates ─────────────────────────
// These are the faculties present at essentially every Nigerian federal
// university. A "department" list per faculty is deliberately the common
// core; niche departments vary by school and can be added via the admin UI.

const FACULTY_TEMPLATES: Record<string, string[]> = {
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
};

// The faculty list a typical comprehensive federal/state university carries.
const COMPREHENSIVE_UNIVERSITY_FACULTIES = [
  "Agriculture", "Arts", "Basic Medical Sciences", "Clinical Sciences",
  "Dentistry", "Education", "Engineering", "Environmental Sciences",
  "Law", "Management Sciences", "Pharmacy", "Science", "Social Sciences",
  "Veterinary Medicine",
];

// Technology-focused universities (FUTA, FUTO, FUTMINNA, ATBU, ESUT, etc.).
const TECHNOLOGY_UNIVERSITY_FACULTIES = [
  "Agriculture", "Engineering", "Environmental Sciences",
  "Management Sciences", "Science", "Computing", "Health Sciences",
];

// Agriculture-focused universities (MOUAU, FUNAAB, LAUTECH).
const AGRICULTURE_UNIVERSITY_FACULTIES = [
  "Agriculture", "Engineering", "Environmental Sciences",
  "Management Sciences", "Science", "Veterinary Medicine",
];

// ── Institution catalogue ─────────────────────────────────────────
// [name, shortName, state, facultyKeys[]]
type InstitutionSeed = [string, string, string, string[]];

const INSTITUTIONS: InstitutionSeed[] = [
  // Federal universities
  ["University of Lagos", "UNILAG", "Lagos", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Nigeria, Nsukka", "UNN", "Enugu", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Ahmadu Bello University", "ABU", "Kaduna", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Obafemi Awolowo University", "OAU", "Osun", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Ibadan", "UI", "Oyo", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Benin", "UNIBEN", "Edo", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Ilorin", "UNILORIN", "Kwara", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Jos", "UNIJOS", "Plateau", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Port Harcourt", "UNIPORT", "Rivers", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Calabar", "UNICAL", "Cross River", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Maiduguri", "UNIMAID", "Borno", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Abuja", "UNIABUJA", "FCT", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Bayero University Kano", "BUK", "Kano", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Usmanu Danfodiyo University, Sokoto", "UDUS", "Sokoto", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Nnamdi Azikiwe University", "UNIZIK", "Anambra", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["University of Uyo", "UNIUYO", "Akwa Ibom", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University of Technology, Akure", "FUTA", "Ondo", TECHNOLOGY_UNIVERSITY_FACULTIES],
  ["Federal University of Technology, Minna", "FUTMINNA", "Niger", TECHNOLOGY_UNIVERSITY_FACULTIES],
  ["Federal University of Technology, Owerri", "FUTO", "Imo", TECHNOLOGY_UNIVERSITY_FACULTIES],
  ["Abubakar Tafawa Balewa University", "ATBU", "Bauchi", TECHNOLOGY_UNIVERSITY_FACULTIES],
  ["Michael Okpara University of Agriculture, Umudike", "MOUAU", "Abia", AGRICULTURE_UNIVERSITY_FACULTIES],
  ["Federal University of Agriculture, Abeokuta", "FUNAAB", "Ogun", AGRICULTURE_UNIVERSITY_FACULTIES],
  ["Federal University, Oye-Ekiti", "FUOYE", "Ekiti", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Dutsin-Ma", "FUDMA", "Katsina", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Lafia", "FULAFIA", "Nasarawa", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Lokoja", "FULOKOJA", "Kogi", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Kashere", "FUKASHERE", "Gombe", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Wukari", "FUWUKARI", "Taraba", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Otuoke", "FUOTUOKE", "Bayelsa", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Birnin Kebbi", "FUBK", "Kebbi", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Gusau", "FUGUSAU", "Zamfara", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Federal University, Gashua", "FUGASHUA", "Yobe", COMPREHENSIVE_UNIVERSITY_FACULTIES],

  // State universities
  ["Lagos State University", "LASU", "Lagos", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Ambrose Alli University", "AAU", "Edo", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Delta State University, Abraka", "DELSU", "Delta", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Ekiti State University", "EKSU", "Ekiti", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Enugu State University of Science and Technology", "ESUT", "Enugu", TECHNOLOGY_UNIVERSITY_FACULTIES],
  ["Imo State University", "IMSU", "Imo", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Kaduna State University", "KASU", "Kaduna", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Kogi State University", "KSU", "Kogi", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Niger Delta University", "NDU", "Bayelsa", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Olabisi Onabanjo University", "OOU", "Ogun", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Rivers State University", "RSU", "Rivers", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Nasarawa State University", "NSUK", "Nasarawa", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Benue State University", "BSU", "Benue", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Gombe State University", "GSU", "Gombe", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Adamawa State University", "ADSU", "Adamawa", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Ebonyi State University", "EBSU", "Ebonyi", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Abia State University", "ABSU", "Abia", COMPREHENSIVE_UNIVERSITY_FACULTIES],
  ["Osun State University", "UNIOSUN", "Osun", COMPREHENSIVE_UNIVERSITY_FACULTIES],

  // Polytechnics
  ["Yaba College of Technology", "YABATECH", "Lagos", [
    "Engineering", "Environmental Sciences", "Management Sciences", "Science",
  ]],
  ["Federal Polytechnic, Ilaro", "ILAROPOLY", "Ogun", [
    "Engineering", "Management Sciences", "Science",
  ]],
  ["Auchi Polytechnic", "AUCHIPOLY", "Edo", [
    "Engineering", "Environmental Sciences", "Management Sciences", "Science",
  ]],

  // Colleges of education
  ["Federal College of Education (Technical), Akoka", "FCET-AKOKA", "Lagos", [
    "Education", "Science",
  ]],
  ["Alvan Ikoku Federal College of Education", "AIFCE", "Imo", [
    "Education", "Arts", "Science",
  ]],
];

async function main() {
  let institutions = 0;
  let faculties = 0;
  let departments = 0;

  for (const [name, shortName, state, facultyKeys] of INSTITUTIONS) {
    const institution = await prisma.institution.upsert({
      where: { name },
      update: { shortName, state },
      create: { name, shortName, state },
    });
    institutions += 1;

    for (const key of facultyKeys) {
      const departmentsList = FACULTY_TEMPLATES[key] ?? [];
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
