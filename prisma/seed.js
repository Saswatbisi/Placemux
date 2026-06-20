import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // 0. Clean up old data
  await prisma.jobSkillThreshold.deleteMany();
  await prisma.job.deleteMany();
  await prisma.kycDocument.deleteMany();
  await prisma.kycVerification.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.companyMembership.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  console.log("🧹 Cleaned old data");

  // 1. Create a demo user
  const passwordHash = await bcrypt.hash("SecurePass123", 12);
  const user = await prisma.user.create({
    data: {
      name: "Saswat Bisi",
      email: "saswat@placemux.com",
      passwordHash,
      phone: "+919876543210",
    },
  });
  console.log("✅ Created user:", user.email);

  // 2. Create a company
  const company = await prisma.company.create({
    data: {
      legalName: "PlaceMux Tech Pvt Ltd",
      displayName: "PlaceMux Tech",
      companyType: "PRIVATE_LIMITED",
      registrationNumber: "U72200OD2026PTC050001",
      status: "ACTIVE",
      memberships: {
        create: { userId: user.id, role: "OWNER" },
      },
      profile: {
        create: {
          description: "India's placement automation platform",
          city: "Bhubaneswar",
          state: "Odisha",
          country: "IN",
        },
      },
      kycVerification: {
        create: { status: "VERIFIED" },
      },
    },
  });
  console.log("✅ Created company:", company.displayName);

  // 3. Create jobs with skill thresholds
  const jobs = [
    {
      title: "Senior React Developer",
      description:
        "Build modern frontend interfaces using React and TypeScript for our fintech platform. You will work with a cross-functional team.",
      location: "Bengaluru, Karnataka",
      employmentType: "FULL_TIME",
      workplaceType: "HYBRID",
      skills: [
        { skill: "React", minimumLevel: 70 },
        { skill: "TypeScript", minimumLevel: 50 },
      ],
    },
    {
      title: "Backend Engineer",
      description:
        "Design and build scalable APIs with Node.js and MongoDB for marketplace services. Experience with microservices preferred.",
      location: "Mumbai, Maharashtra",
      employmentType: "CONTRACT",
      workplaceType: "REMOTE",
      skills: [
        { skill: "Node.js", minimumLevel: 60 },
        { skill: "MongoDB", minimumLevel: 40 },
      ],
    },
    {
      title: "Full Stack Intern",
      description:
        "Learn and contribute to both frontend React and backend Node.js development in a fast-paced startup environment.",
      location: "Bengaluru, Karnataka",
      employmentType: "INTERNSHIP",
      workplaceType: "ONSITE",
      skills: [
        { skill: "React", minimumLevel: 30 },
        { skill: "Node.js", minimumLevel: 20 },
      ],
    },
    {
      title: "DevOps Engineer",
      description:
        "Manage CI/CD pipelines, Docker containers, and Kubernetes clusters. Automate infrastructure with Terraform and AWS.",
      location: "Hyderabad, Telangana",
      employmentType: "FULL_TIME",
      workplaceType: "REMOTE",
      skills: [
        { skill: "Docker", minimumLevel: 65 },
        { skill: "Kubernetes", minimumLevel: 50 },
        { skill: "AWS", minimumLevel: 55 },
      ],
    },
    {
      title: "Data Analyst",
      description:
        "Analyze placement data, generate insights, and build dashboards using Python and SQL to drive business decisions.",
      location: "Pune, Maharashtra",
      employmentType: "PART_TIME",
      workplaceType: "HYBRID",
      skills: [
        { skill: "Python", minimumLevel: 45 },
        { skill: "SQL", minimumLevel: 60 },
      ],
    },
  ];

  for (const job of jobs) {
    const created = await prisma.job.create({
      data: {
        companyId: company.id,
        title: job.title,
        description: job.description,
        location: job.location,
        employmentType: job.employmentType,
        workplaceType: job.workplaceType,
        assessmentToken: randomUUID(),
        skillThresholds: {
          create: job.skills.map((s) => ({
            skill: s.skill,
            skillKey: s.skill.toLowerCase(),
            minimumLevel: s.minimumLevel,
          })),
        },
      },
    });
    console.log(`✅ Created job: ${created.title}`);
  }

  console.log("\n🎉 Seeding complete! 5 jobs created.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
