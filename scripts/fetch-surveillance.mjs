#!/usr/bin/env node
/**
 * Fetch all surveillance-related nodes from OpenStreetMap via Overpass API.
 * Covers US-West region (lat 36-49, lon -125 to -102).
 *
 * Features:
 * - Chunks the bounding box into a grid to avoid Overpass timeouts
 * - Retries with exponential backoff on 429/504/timeout
 * - Classifies nodes by surveillance type
 * - Deduplicates across chunks
 * - Logs progress throughout
 *
 * Usage: node scripts/fetch-surveillance.mjs
 */

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '..', 'public', 'data', 'surveillance-nodes.json');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BBOX = { south: 36.0, west: -125.0, north: 49.0, east: -102.0 };
const GRID_ROWS = 4;
const GRID_COLS = 4;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 5000;
const TIMEOUT_S = 180;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeTiles() {
  const tiles = [];
  const dLat = (BBOX.north - BBOX.south) / GRID_ROWS;
  const dLon = (BBOX.east - BBOX.west) / GRID_COLS;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      tiles.push({
        south: BBOX.south + r * dLat,
        west: BBOX.west + c * dLon,
        north: BBOX.south + (r + 1) * dLat,
        east: BBOX.west + (c + 1) * dLon,
        label: `tile[${r},${c}]`,
      });
    }
  }
  return tiles;
}

async function overpassQuery(query, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (TIMEOUT_S + 30) * 1000);

      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429 || res.status === 504 || res.status >= 500) {
        const delay = BASE_DELAY_MS * Math.pow(3, attempt);
        console.warn(`  ⚠ ${label}: HTTP ${res.status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      return data.elements || [];
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        const delay = BASE_DELAY_MS * Math.pow(3, attempt);
        console.warn(`  ⚠ ${label}: Request timed out, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(delay);
        continue;
      }
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(3, attempt);
        console.warn(`  ⚠ ${label}: ${err.message}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: All ${MAX_RETRIES + 1} attempts failed`);
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classify(element) {
  const tags = element.tags || {};

  // highway=speed_camera
  if (tags.highway === 'speed_camera') return 'speed_camera';

  // enforcement relations — look at enforcement tag
  if (tags.enforcement === 'maxspeed' || tags.enforcement === 'average_speed') return 'speed_camera';
  if (tags.enforcement === 'traffic_signals') return 'red_light_camera';

  // man_made=surveillance subtypes
  const survType = (tags['surveillance:type'] || '').toLowerCase();
  if (survType === 'alpr' || survType === 'anpr') return 'alpr';
  if (survType === 'gunshot_detector') return 'gunshot_detector';

  if (survType === 'camera' || survType === '') {
    const zone = (tags['surveillance:zone'] || '').toLowerCase();
    if (zone === 'traffic') return 'traffic_camera';
    return 'cctv';
  }

  return 'other';
}

function extractNode(element) {
  if (element.type === 'node' && element.lat != null && element.lon != null) {
    return {
      id: element.id,
      lat: element.lat,
      lon: element.lon,
      type: classify(element),
    };
  }
  // For ways/relations with a center
  if (element.center) {
    return {
      id: element.id,
      lat: element.center.lat,
      lon: element.center.lon,
      type: classify(element),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Surveillance Node Fetcher ===');
  console.log(`Region: lat ${BBOX.south}-${BBOX.north}, lon ${BBOX.west}-${BBOX.east}`);
  console.log(`Grid: ${GRID_ROWS}x${GRID_COLS} = ${GRID_ROWS * GRID_COLS} tiles\n`);

  const allNodes = new Map(); // id → node (dedup)
  const tiles = makeTiles();

  // --- Query 1: man_made=surveillance ---
  console.log('--- Phase 1: man_made=surveillance ---');
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const bbox = `${t.south},${t.west},${t.north},${t.east}`;
    const query = `[out:json][timeout:${TIMEOUT_S}];node["man_made"="surveillance"](${bbox});out;`;
    const label = `surveillance ${t.label}`;

    process.stdout.write(`  [${i + 1}/${tiles.length}] ${label}... `);
    const elements = await overpassQuery(query, label);
    let added = 0;
    for (const el of elements) {
      const node = extractNode(el);
      if (node && !allNodes.has(node.id)) {
        allNodes.set(node.id, node);
        added++;
      }
    }
    console.log(`${elements.length} elements, ${added} new (total: ${allNodes.size})`);

    // Be polite to Overpass
    if (i < tiles.length - 1) await sleep(1000);
  }

  // --- Query 2: highway=speed_camera ---
  console.log('\n--- Phase 2: highway=speed_camera ---');
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const bbox = `${t.south},${t.west},${t.north},${t.east}`;
    const query = `[out:json][timeout:${TIMEOUT_S}];node["highway"="speed_camera"](${bbox});out;`;
    const label = `speed_camera ${t.label}`;

    process.stdout.write(`  [${i + 1}/${tiles.length}] ${label}... `);
    const elements = await overpassQuery(query, label);
    let added = 0;
    for (const el of elements) {
      const node = extractNode(el);
      if (node && !allNodes.has(node.id)) {
        allNodes.set(node.id, node);
        added++;
      }
    }
    console.log(`${elements.length} elements, ${added} new (total: ${allNodes.size})`);

    if (i < tiles.length - 1) await sleep(1000);
  }

  // --- Query 3: enforcement relations (get device nodes) ---
  console.log('\n--- Phase 3: enforcement relations ---');
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const bbox = `${t.south},${t.west},${t.north},${t.east}`;
    // Get enforcement nodes directly — these are the device nodes tagged with enforcement=*
    const query = `[out:json][timeout:${TIMEOUT_S}];node["enforcement"](${bbox});out;`;
    const label = `enforcement ${t.label}`;

    process.stdout.write(`  [${i + 1}/${tiles.length}] ${label}... `);
    const elements = await overpassQuery(query, label);
    let added = 0;
    for (const el of elements) {
      const node = extractNode(el);
      if (node && !allNodes.has(node.id)) {
        allNodes.set(node.id, node);
        added++;
      }
    }
    console.log(`${elements.length} elements, ${added} new (total: ${allNodes.size})`);

    if (i < tiles.length - 1) await sleep(1000);
  }

  // --- Summary and output ---
  const nodes = [...allNodes.values()];
  const typeCounts = {};
  for (const n of nodes) {
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total nodes: ${nodes.length}`);
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  writeFileSync(OUTPUT, JSON.stringify(nodes));
  const sizeMB = (Buffer.byteLength(JSON.stringify(nodes)) / 1024 / 1024).toFixed(2);
  console.log(`\nOutput: ${OUTPUT} (${sizeMB} MB)`);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
