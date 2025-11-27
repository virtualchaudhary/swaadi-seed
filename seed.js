/**
 * Enhanced Seeder for Swaadi Platform
 * Handles CSV import with all columns including description, phone, tags
 */

const fs = require('fs');
const parse = require('csv-parse/sync').parse;
const { Client } = require('pg');

// Generate URL-friendly slug
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

(async () => {
  let client = null;
  
  try {
    // Read CSV file
    const csvPath = process.argv[2] || 'chandigarh.csv';
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found: ${csvPath}`);
      process.exit(1);
    }

    const csv = fs.readFileSync(csvPath, 'utf8');
    const rows = parse(csv, { 
      columns: true, 
      skip_empty_lines: true,
      trim: true 
    });

    console.log(`📄 Found ${rows.length} rows in CSV`);

    // Database connection
    client = new Client({
      connectionString: process.env.DATABASE_URL || 
        'postgresql://swaadi:swaadi_pass@localhost:5432/swaadi'
    });

    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // ============================================
    // 1. Seed Categories
    // ============================================
    console.log('\n📁 Seeding categories...');
    const categories = [
      { slug: 'eat', name: 'Eat', icon: '🍽️' },
      { slug: 'stay', name: 'Stay', icon: '🏨' },
      { slug: 'cafe', name: 'Cafe', icon: '☕' },
      { slug: 'bakery', name: 'Bakery', icon: '🥐' },
      { slug: 'street-food', name: 'Street Food', icon: '🍜' },
    ];

    for (const cat of categories) {
      await client.query(
        `INSERT INTO categories (slug, name, icon) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon`,
        [cat.slug, cat.name, cat.icon]
      );
    }
    console.log(`✅ Inserted ${categories.length} categories`);

    // ============================================
    // 2. Seed Tags
    // ============================================
    console.log('\n🏷️  Seeding tags...');
    const tagSet = new Set();
    
    // Collect all unique tags from CSV
    rows.forEach(row => {
      if (row.tags) {
        const tags = row.tags.split('|').map(t => t.trim()).filter(Boolean);
        tags.forEach(tag => tagSet.add(tag));
      }
    });

    const tagMap = new Map();
    for (const tagSlug of tagSet) {
      const tagName = tagSlug
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      const result = await client.query(
        `INSERT INTO tags (slug, name) 
         VALUES ($1, $2) 
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [tagSlug, tagName]
      );
      tagMap.set(tagSlug, result.rows[0].id);
    }
    console.log(`✅ Inserted/updated ${tagMap.size} tags`);

    // ============================================
    // 3. Seed City
    // ============================================
    console.log('\n🏙️  Seeding city...');
    await client.query(
      `INSERT INTO cities (slug, name, state, country, center_lat, center_lng)
       VALUES ('chandigarh', 'Chandigarh', 'Punjab', 'India', 30.7333, 76.7794)
       ON CONFLICT (slug) DO NOTHING`
    );
    console.log('✅ City seeded');

    // ============================================
    // 4. Seed Places
    // ============================================
    console.log('\n📍 Seeding places...');
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const row of rows) {
      try {
        // Parse coordinates
        const lng = parseFloat(row.lng);
        const lat = parseFloat(row.lat);
        
        if (isNaN(lng) || isNaN(lat)) {
          console.warn(`⚠️  Skipping ${row.name}: Invalid coordinates`);
          errorCount++;
          continue;
        }

        // Determine category
        let category_id = 1; // Default: Eat
        const cat = (row.category || '').toLowerCase();
        if (cat.includes('stay')) category_id = 2;
        else if (cat.includes('cafe')) category_id = 3;
        else if (cat.includes('bakery')) category_id = 4;

        // Parse cuisines
        const cuisines = row.cuisines 
          ? row.cuisines.split('|').map(c => c.trim()).filter(Boolean)
          : [];

        // Parse price range (default to 1 if not provided)
        const price_range = row.price_range 
          ? Math.max(1, Math.min(4, parseInt(row.price_range)))
          : 1;

        // Generate slug
        const slug = generateSlug(row.name) + '-' + Date.now().toString(36);

        // Insert place
        const placeResult = await client.query(
          `INSERT INTO places (
            name, slug, category_id, subcategory, description, short_description,
            address, phone, city_slug, city_id,
            cuisines, price_range, geom, images, status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 
            (SELECT id FROM cities WHERE slug = $9), 
            $10::text[], $11, 
            ST_SetSRID(ST_MakePoint($12, $13), 4326), 
            '[]'::jsonb, 'active'
          )
          RETURNING id`,
          [
            row.name,
            slug,
            category_id,
            row.subcategory || null,
            row.description || null,
            row.description ? row.description.substring(0, 200) : null,
            row.address,
            row.phone || null,
            'chandigarh',
            cuisines,
            price_range,
            lng,
            lat
          ]
        );

        const placeId = placeResult.rows[0].id;

        // Link tags
        if (row.tags) {
          const tagSlugs = row.tags.split('|').map(t => t.trim()).filter(Boolean);
          for (const tagSlug of tagSlugs) {
            const tagId = tagMap.get(tagSlug);
            if (tagId) {
              await client.query(
                `INSERT INTO place_tags (place_id, tag_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [placeId, tagId]
              );
            }
          }
        }

        successCount++;
        if (successCount % 10 === 0) {
          process.stdout.write(`\r✅ Inserted ${successCount}/${rows.length} places...`);
        }

      } catch (err) {
        errorCount++;
        errors.push({ name: row.name, error: err.message });
        console.error(`\n❌ Error inserting ${row.name}:`, err.message);
      }
    }

    console.log(`\n\n✅ Seeding completed!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.slice(0, 10).forEach(e => {
        console.log(`   - ${e.name}: ${e.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more`);
      }
    }

    // ============================================
    // 5. Update Statistics
    // ============================================
    console.log('\n📊 Updating statistics...');
    await client.query(`
      UPDATE places 
      SET review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE reviews.place_id = places.id AND reviews.status = 'approved'
      )
    `);
    console.log('✅ Statistics updated');

  } catch (err) {
    console.error('\n❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n👋 Database connection closed');
    }
  }
})();
