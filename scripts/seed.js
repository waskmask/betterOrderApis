const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const AdminUser = require("../modals/AdminUser");
const Cuisine = require("../modals/Cuisine");
const {
  Restaurant,
  generateUsername,
  generateNextCustomerId,
} = require("../modals/Restaurant");

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

const seedDatabase = async () => {
  try {
    // Clear existing data
    console.log("🗑️  Clearing existing data...");
    await AdminUser.deleteMany({});
    await Cuisine.deleteMany({});
    await Restaurant.deleteMany({});
    console.log("✅ Existing data cleared");

    // Seed Admin Users
    console.log("👤 Seeding Admin Users...");
    const hashedPassword = await bcrypt.hash("password123", 10);

    const adminUsers = await AdminUser.insertMany([
      {
        name: "Super Admin",
        email: "superadmin@betterorder.com",
        password: hashedPassword,
        role: "superadmin",
        phone: "+49 123 456 7890",
        isActive: true,
        tokenVersion: 0,
      },
      {
        name: "Admin User 1",
        email: "admin1@betterorder.com",
        password: hashedPassword,
        role: "admin",
        phone: "+49 123 456 7891",
        isActive: true,
        tokenVersion: 0,
      },
      {
        name: "Admin User 2",
        email: "admin2@betterorder.com",
        password: hashedPassword,
        role: "admin",
        phone: "+49 123 456 7892",
        isActive: true,
        tokenVersion: 0,
      },
      {
        name: "Sales Representative",
        email: "sales@betterorder.com",
        password: hashedPassword,
        role: "sales",
        phone: "+49 123 456 7893",
        isActive: true,
        tokenVersion: 0,
      },
      {
        name: "Moderator",
        email: "moderator@betterorder.com",
        password: hashedPassword,
        role: "moderator",
        phone: "+49 123 456 7894",
        isActive: true,
        tokenVersion: 0,
      },
    ]);
    console.log(`✅ Created ${adminUsers.length} admin users`);
    console.log("   All admin users have password: password123");

    // Seed Cuisines
    console.log("🍽️  Seeding Cuisines...");
    const cuisines = await Cuisine.insertMany([
      {
        name: "Italian",
        description: "Authentic Italian cuisine with pasta, pizza, and more",
        isActive: true,
      },
      {
        name: "Chinese",
        description: "Traditional Chinese dishes and flavors",
        isActive: true,
      },
      {
        name: "Indian",
        description: "Spicy and flavorful Indian cuisine",
        isActive: true,
      },
      {
        name: "Mexican",
        description: "Tacos, burritos, and authentic Mexican flavors",
        isActive: true,
      },
      {
        name: "Japanese",
        description: "Sushi, ramen, and traditional Japanese dishes",
        isActive: true,
      },
      {
        name: "Thai",
        description: "Aromatic and spicy Thai cuisine",
        isActive: true,
      },
      {
        name: "American",
        description: "Classic American comfort food",
        isActive: true,
      },
      {
        name: "Mediterranean",
        description: "Fresh and healthy Mediterranean dishes",
        isActive: true,
      },
    ]);
    console.log(`✅ Created ${cuisines.length} cuisine types`);

    // Get superadmin for created_by field
    const superAdmin = adminUsers.find((u) => u.role === "superadmin");

    // Seed Restaurants
    console.log("🏪 Seeding Restaurants...");
    const restaurantPassword = await bcrypt.hash("restaurant123", 10);

    // Restaurant 1: Italian
    const italianCuisine = cuisines.find((c) => c.name === "Italian");
    const username1 = await generateUsername("Bella Italia");
    const customerId1 = await generateNextCustomerId();

    const restaurant1 = await Restaurant.create({
      restaurant_name: "Bella Italia",
      username: username1,
      customer_id: customerId1,
      ownerName: "Marco Rossi",
      companyName: "Bella Italia GmbH",
      taxId: "DE123456789",
      phoneNumber: "+49 30 12345678",
      email: "info@bellaitalia.de",
      password: restaurantPassword,
      address: {
        street: "Hauptstraße",
        houseNumber: "42",
        postalCode: "10115",
        city: "Berlin",
        country: "Germany",
      },
      cuisine_type: [italianCuisine._id],
      coordinates: {
        lat: 52.520008,
        lng: 13.404954,
      },
      description: "Authentic Italian restaurant serving traditional pasta and pizza",
      isHalal: false,
      delivery: true,
      take_away: true,
      delivery_radius: 5,
      delivering_at: [
        {
          postalCode: "10115",
          charges: 2.5,
          free: false,
          delivery_time: "30 mins",
          min_order_value: 15,
        },
        {
          postalCode: "10117",
          charges: 3.0,
          free: false,
          delivery_time: "35 mins",
          min_order_value: 20,
        },
      ],
      menu: [
        {
          category_name: "Pizza",
          category_desc: "Wood-fired authentic pizzas",
          index: 0,
          isActive: true,
          items: [
            {
              item_name: "Margherita",
              item_desc: "Tomato, mozzarella, basil",
              index: 0,
              price: [{ item_size: "Regular", item_price: 8.5 }],
              highlight: true,
              isActive: true,
            },
            {
              item_name: "Pepperoni",
              item_desc: "Tomato, mozzarella, pepperoni",
              index: 1,
              price: [{ item_size: "Regular", item_price: 10.5 }],
              highlight: false,
              isActive: true,
            },
          ],
        },
        {
          category_name: "Pasta",
          category_desc: "Fresh pasta dishes",
          index: 1,
          isActive: true,
          items: [
            {
              item_name: "Spaghetti Carbonara",
              item_desc: "Creamy pasta with bacon and parmesan",
              index: 0,
              price: [{ item_size: "Regular", item_price: 12.5 }],
              highlight: true,
              isActive: true,
            },
          ],
        },
      ],
      opening_hours: {
        monday: { ifClosed: false, opening: "11:00", closing: "22:00" },
        tuesday: { ifClosed: false, opening: "11:00", closing: "22:00" },
        wednesday: { ifClosed: false, opening: "11:00", closing: "22:00" },
        thursday: { ifClosed: false, opening: "11:00", closing: "22:00" },
        friday: { ifClosed: false, opening: "11:00", closing: "23:00" },
        saturday: { ifClosed: false, opening: "12:00", closing: "23:00" },
        sunday: { ifClosed: false, opening: "12:00", closing: "21:00" },
      },
      payment_methods: ["cod", "paypal", "online"],
      isActive: true,
      visibility: true,
      created_by: superAdmin._id,
      tokenVersion: 0,
    });

    // Restaurant 2: Chinese
    const chineseCuisine = cuisines.find((c) => c.name === "Chinese");
    const username2 = await generateUsername("Golden Dragon");
    const customerId2 = await generateNextCustomerId();

    const restaurant2 = await Restaurant.create({
      restaurant_name: "Golden Dragon",
      username: username2,
      customer_id: customerId2,
      ownerName: "Li Wei",
      companyName: "Golden Dragon Restaurant",
      taxId: "DE987654321",
      phoneNumber: "+49 30 87654321",
      email: "info@goldendragon.de",
      password: restaurantPassword,
      address: {
        street: "Friedrichstraße",
        houseNumber: "123",
        postalCode: "10117",
        city: "Berlin",
        country: "Germany",
      },
      cuisine_type: [chineseCuisine._id],
      coordinates: {
        lat: 52.5159,
        lng: 13.3777,
      },
      description: "Authentic Chinese cuisine with traditional recipes",
      isHalal: false,
      delivery: true,
      take_away: true,
      delivery_radius: 7,
      delivering_at: [
        {
          postalCode: "10117",
          charges: 3.0,
          free: false,
          delivery_time: "40 mins",
          min_order_value: 20,
        },
      ],
      menu: [
        {
          category_name: "Main Dishes",
          category_desc: "Traditional Chinese main courses",
          index: 0,
          isActive: true,
          items: [
            {
              item_name: "Sweet and Sour Chicken",
              item_desc: "Crispy chicken with sweet and sour sauce",
              index: 0,
              price: [{ item_size: "Regular", item_price: 14.5 }],
              highlight: true,
              isActive: true,
            },
            {
              item_name: "Kung Pao Chicken",
              item_desc: "Spicy chicken with peanuts",
              index: 1,
              price: [{ item_size: "Regular", item_price: 15.0 }],
              highlight: false,
              isActive: true,
            },
          ],
        },
        {
          category_name: "Rice & Noodles",
          category_desc: "Fried rice and noodle dishes",
          index: 1,
          isActive: true,
          items: [
            {
              item_name: "Fried Rice",
              item_desc: "Classic Chinese fried rice",
              index: 0,
              price: [{ item_size: "Regular", item_price: 9.5 }],
              highlight: false,
              isActive: true,
            },
          ],
        },
      ],
      opening_hours: {
        monday: { ifClosed: false, opening: "12:00", closing: "23:00" },
        tuesday: { ifClosed: false, opening: "12:00", closing: "23:00" },
        wednesday: { ifClosed: false, opening: "12:00", closing: "23:00" },
        thursday: { ifClosed: false, opening: "12:00", closing: "23:00" },
        friday: { ifClosed: false, opening: "12:00", closing: "00:00", nextDay: true },
        saturday: { ifClosed: false, opening: "12:00", closing: "00:00", nextDay: true },
        sunday: { ifClosed: false, opening: "12:00", closing: "22:00" },
      },
      payment_methods: ["cod", "online"],
      isActive: true,
      visibility: true,
      created_by: superAdmin._id,
      tokenVersion: 0,
    });

    // Restaurant 3: Indian
    const indianCuisine = cuisines.find((c) => c.name === "Indian");
    const username3 = await generateUsername("Taj Mahal");
    const customerId3 = await generateNextCustomerId();

    const restaurant3 = await Restaurant.create({
      restaurant_name: "Taj Mahal",
      username: username3,
      customer_id: customerId3,
      ownerName: "Raj Patel",
      companyName: "Taj Mahal Restaurant",
      taxId: "DE456789123",
      phoneNumber: "+49 30 55555555",
      email: "info@tajmahal.de",
      password: restaurantPassword,
      address: {
        street: "Kurfürstendamm",
        houseNumber: "200",
        postalCode: "10719",
        city: "Berlin",
        country: "Germany",
      },
      cuisine_type: [indianCuisine._id],
      coordinates: {
        lat: 52.5025,
        lng: 13.3304,
      },
      description: "Authentic Indian cuisine with vegetarian and non-vegetarian options",
      isHalal: true,
      delivery: true,
      take_away: true,
      delivery_radius: 6,
      delivering_at: [
        {
          postalCode: "10719",
          charges: 2.0,
          free: true,
          delivery_time: "35 mins",
          min_order_value: 25,
        },
        {
          postalCode: "10715",
          charges: 3.5,
          free: false,
          delivery_time: "40 mins",
          min_order_value: 30,
        },
      ],
      menu: [
        {
          category_name: "Curries",
          category_desc: "Traditional Indian curries",
          index: 0,
          isActive: true,
          items: [
            {
              item_name: "Butter Chicken",
              item_desc: "Creamy tomato-based curry with chicken",
              index: 0,
              price: [{ item_size: "Regular", item_price: 16.5 }],
              highlight: true,
              isActive: true,
            },
            {
              item_name: "Chicken Tikka Masala",
              item_desc: "Grilled chicken in spiced tomato sauce",
              index: 1,
              price: [{ item_size: "Regular", item_price: 17.0 }],
              highlight: true,
              isActive: true,
            },
          ],
        },
        {
          category_name: "Breads",
          category_desc: "Fresh Indian breads",
          index: 1,
          isActive: true,
          items: [
            {
              item_name: "Garlic Naan",
              item_desc: "Fresh baked garlic naan bread",
              index: 0,
              price: [{ item_size: "Regular", item_price: 4.5 }],
              highlight: false,
              isActive: true,
            },
          ],
        },
      ],
      opening_hours: {
        monday: { ifClosed: false, opening: "11:30", closing: "23:00" },
        tuesday: { ifClosed: false, opening: "11:30", closing: "23:00" },
        wednesday: { ifClosed: false, opening: "11:30", closing: "23:00" },
        thursday: { ifClosed: false, opening: "11:30", closing: "23:00" },
        friday: { ifClosed: false, opening: "11:30", closing: "23:30" },
        saturday: { ifClosed: false, opening: "12:00", closing: "23:30" },
        sunday: { ifClosed: false, opening: "12:00", closing: "22:30" },
      },
      payment_methods: ["cod", "paypal", "online"],
      isActive: true,
      visibility: true,
      created_by: superAdmin._id,
      tokenVersion: 0,
    });

    // Restaurant 4: Japanese
    const japaneseCuisine = cuisines.find((c) => c.name === "Japanese");
    const username4 = await generateUsername("Sakura Sushi");
    const customerId4 = await generateNextCustomerId();

    const restaurant4 = await Restaurant.create({
      restaurant_name: "Sakura Sushi",
      username: username4,
      customer_id: customerId4,
      ownerName: "Yuki Tanaka",
      companyName: "Sakura Sushi Berlin",
      taxId: "DE789123456",
      phoneNumber: "+49 30 99988877",
      email: "info@sakurasushi.de",
      password: restaurantPassword,
      address: {
        street: "Potsdamer Platz",
        houseNumber: "1",
        postalCode: "10785",
        city: "Berlin",
        country: "Germany",
      },
      cuisine_type: [japaneseCuisine._id],
      coordinates: {
        lat: 52.5096,
        lng: 13.3766,
      },
      description: "Fresh sushi and Japanese cuisine",
      isHalal: false,
      delivery: true,
      take_away: true,
      delivery_radius: 4,
      delivering_at: [
        {
          postalCode: "10785",
          charges: 4.0,
          free: false,
          delivery_time: "25 mins",
          min_order_value: 30,
        },
      ],
      menu: [
        {
          category_name: "Sushi Sets",
          category_desc: "Assorted sushi platters",
          index: 0,
          isActive: true,
          items: [
            {
              item_name: "Salmon Sushi Set",
              item_desc: "8 pieces of fresh salmon sushi",
              index: 0,
              price: [{ item_size: "Regular", item_price: 18.5 }],
              highlight: true,
              isActive: true,
            },
            {
              item_name: "Mixed Sushi Set",
              item_desc: "12 pieces of assorted sushi",
              index: 1,
              price: [{ item_size: "Regular", item_price: 24.0 }],
              highlight: true,
              isActive: true,
            },
          ],
        },
        {
          category_name: "Ramen",
          category_desc: "Traditional Japanese ramen",
          index: 1,
          isActive: true,
          items: [
            {
              item_name: "Tonkotsu Ramen",
              item_desc: "Rich pork bone broth ramen",
              index: 0,
              price: [{ item_size: "Regular", item_price: 13.5 }],
              highlight: false,
              isActive: true,
            },
          ],
        },
      ],
      opening_hours: {
        monday: { ifClosed: false, opening: "12:00", closing: "22:00" },
        tuesday: { ifClosed: false, opening: "12:00", closing: "22:00" },
        wednesday: { ifClosed: false, opening: "12:00", closing: "22:00" },
        thursday: { ifClosed: false, opening: "12:00", closing: "22:00" },
        friday: { ifClosed: false, opening: "12:00", closing: "23:00" },
        saturday: { ifClosed: false, opening: "12:00", closing: "23:00" },
        sunday: { ifClosed: true },
      },
      payment_methods: ["cod", "online"],
      isActive: true,
      visibility: true,
      created_by: superAdmin._id,
      tokenVersion: 0,
    });

    console.log(`✅ Created ${4} restaurants`);
    console.log("   All restaurants have password: restaurant123");

    console.log("\n📊 Seeding Summary:");
    console.log(`   - Admin Users: ${adminUsers.length}`);
    console.log(`   - Cuisines: ${cuisines.length}`);
    console.log(`   - Restaurants: 4`);
    console.log("\n✅ Database seeding completed successfully!");
    console.log("\n📝 Test Credentials:");
    console.log("   Admin Users:");
    console.log("     - Email: superadmin@betterorder.com, Password: password123");
    console.log("     - Email: admin1@betterorder.com, Password: password123");
    console.log("   Restaurants:");
    console.log("     - Email: info@bellaitalia.de, Password: restaurant123");
    console.log("     - Email: info@goldendragon.de, Password: restaurant123");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
};

const runSeed = async () => {
  try {
    await connectDB();
    await seedDatabase();
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

runSeed();


