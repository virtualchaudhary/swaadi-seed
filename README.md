# Swaadi Data Seeder

## Overview
Enhanced seeder that imports CSV data into the Swaadi database with full support for all columns.

## Features

- ✅ Handles all CSV columns (name, category, description, phone, tags, etc.)
- ✅ Automatic tag creation and linking
- ✅ Slug generation for SEO-friendly URLs
- ✅ Category mapping
- ✅ Error handling and reporting
- ✅ Progress tracking

## Usage

### Basic Usage

```bash
# Install dependencies
npm install

# Seed from CSV file
node seed.js chandigarh.csv
```

### With Custom Database

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname node seed.js chandigarh.csv
```

## CSV Format

Expected columns:
- `name` - Place name (required)
- `category` - Category (Eat, Stay, Cafe, Bakery)
- `subcategory` - Subcategory
- `address` - Full address (required)
- `lat`, `lng` - Coordinates (required)
- `cuisines` - Pipe-separated (e.g., "North Indian|Punjabi")
- `price_range` - 1-4 (Budget to Very Expensive)
- `tags` - Pipe-separated (e.g., "wifi|parking|romantic")
- `phone` - Phone number
- `description` - Full description

## Example CSV

```csv
name,category,subcategory,address,lat,lng,cuisines,price_range,tags,phone,description
The Punjabi Dhaba,Eat,Casual Dining,"Sector 17, Chandigarh",30.733315,76.779418,North Indian|Punjabi,1,family_friendly|budget,9999999990,"Popular Punjabi dhaba"
```

## What It Does

1. **Creates Categories** - Inserts/updates categories (Eat, Stay, Cafe, Bakery)
2. **Creates Tags** - Automatically creates tags from CSV data
3. **Creates City** - Adds city entry if not exists
4. **Inserts Places** - Imports all places with full details
5. **Links Tags** - Connects places to their tags
6. **Updates Statistics** - Recalculates review counts

## Output

The seeder provides:
- Progress updates every 10 places
- Success/error counts
- Detailed error messages for failed inserts
- Final statistics

## Error Handling

- Skips rows with invalid coordinates
- Continues on individual row errors
- Reports all errors at the end
- Validates data before insertion

## Notes

- Duplicate names will create unique slugs with timestamp
- Tags are created automatically if they don't exist
- Categories are matched case-insensitively
- Price range is clamped to 1-4

