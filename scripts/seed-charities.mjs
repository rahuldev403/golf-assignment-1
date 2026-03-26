import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.warn("No .env.local found, using environment variables");
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const charityData = [
  {
    name: "Global Education Initiative",
    description:
      "Providing quality education to underprivileged children in developing countries. Our programs focus on literacy, STEM training, and skill development to empower the next generation.",
    category: "Education",
    is_featured: true,
    image_url:
      "https://images.unsplash.com/photo-1427504494785-cdea0d653def?w=800&h=600&fit=crop",
  },
  {
    name: "Ocean Conservation Alliance",
    description:
      "Dedicated to protecting marine ecosystems and combating ocean pollution. We work to conserve endangered marine species and restore damaged coral reefs worldwide.",
    category: "Environment",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop",
  },
  {
    name: "Healthcare for All",
    description:
      "Ensuring access to quality healthcare in underserved communities. We provide medical services, preventive care, and health education to rural and urban populations in need.",
    category: "Health",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=600&fit=crop",
  },
  {
    name: "Renewable Energy Foundation",
    description:
      "Accelerating the transition to sustainable energy. We develop solar and wind projects in remote areas, creating jobs while reducing carbon emissions and fighting climate change.",
    category: "Environment",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1509391366360-2e938e40b1be?w=800&h=600&fit=crop",
  },
  {
    name: "Youth Mentorship Network",
    description:
      "Empowering young people through mentorship and leadership programs. Our network connects accomplished professionals with disadvantaged youth to guide them toward successful futures.",
    category: "Education",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=600&fit=crop",
  },
  {
    name: "Community Health Outreach",
    description:
      "Bringing medical expertise and preventive health services to communities where they\u2019re needed most. We run free clinics, vaccination drives, and health awareness campaigns.",
    category: "Health",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1583324156186-5f1b07d16df6?w=800&h=600&fit=crop",
  },
  {
    name: "Reforestation Initiative",
    description:
      "Planting millions of trees to restore degraded forests and combat deforestation. Our efforts create habitats for wildlife while sequestering carbon and improving air quality.",
    category: "Environment",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop",
  },
  {
    name: "Women in STEM Foundation",
    description:
      "Advancing gender equality in science, technology, engineering, and mathematics. We provide scholarships, training, and professional development for women pursuing STEM careers.",
    category: "Education",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop",
  },
  {
    name: "Mental Health First",
    description:
      "Providing accessible mental health services and support for individuals struggling with depression, anxiety, and trauma. We offer counseling, crisis intervention, and community support programs.",
    category: "Health",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&h=600&fit=crop",
  },
  {
    name: "Urban Gardens Project",
    description:
      "Creating green spaces in cities and educating communities about sustainable urban agriculture. Our gardens provide fresh produce, recreation areas, and environmental benefits.",
    category: "Environment",
    is_featured: false,
    image_url:
      "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=800&h=600&fit=crop",
  },
];

async function main() {
  loadEnvFile();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("Starting charity seeding...\n");

  try {
    // Check if charities already exist
    const { data: existingCharities, error: checkError } = await supabase
      .from("charities")
      .select("id")
      .limit(1);

    if (checkError) {
      console.error("Error checking charities:", checkError.message);
      process.exit(1);
    }

    if (existingCharities && existingCharities.length > 0) {
      console.log(
        "Charities already exist in the database. Skipping seed to avoid duplicates.",
      );
      console.log("To seed again, delete existing charities first.\n");
      process.exit(0);
    }

    // Insert charities
    const { data: insertedCharities, error: insertError } = await supabase
      .from("charities")
      .insert(charityData)
      .select();

    if (insertError) {
      console.error("Error inserting charities:", insertError.message);
      process.exit(1);
    }

    console.log(
      `✓ Successfully seeded ${insertedCharities?.length || 0} charities:\n`,
    );
    insertedCharities?.forEach((charity) => {
      console.log(`  - ${charity.name} (${charity.category})`);
    });

    console.log("\n✓ Charity seeding completed successfully!");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
