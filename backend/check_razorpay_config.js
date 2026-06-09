#!/usr/bin/env node
/**
 * Diagnostic tool to check Razorpay configuration
 * Run: node check_razorpay_config.js
 */

require('dotenv').config();
const { pool } = require('./src/config/database');

async function checkRazorpayConfig() {
  const client = await pool.connect();
  try {
    console.log('\n🔍 Razorpay Configuration Checker\n');
    console.log('━'.repeat(60));

    // Check environment variables
    console.log('\n📋 Environment Variables:');
    console.log(`  RAZORPAY_KEY_ID:        ${process.env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ NOT SET'}`);
    console.log(`  RAZORPAY_KEY_SECRET:    ${process.env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ NOT SET'}`);
    console.log(`  RAZORPAY_WEBHOOK_SECRET: ${process.env.RAZORPAY_WEBHOOK_SECRET ? '✅ Set' : '❌ NOT SET'}`);

    // Check database settings
    console.log('\n💾 Database Settings (platform_settings):');
    const result = await client.query('SELECT value FROM platform_settings WHERE key = $1', ['company']);
    
    if (result.rows.length === 0) {
      console.log('  ❌ No "company" settings found in database');
      console.log('  → Need to save Razorpay credentials via UI first');
    } else {
      const settings = result.rows[0].value || {};
      console.log(`  ✅ Company settings found`);
      console.log(`  ├─ razorpay_key_id:        ${settings.razorpay_key_id ? '✅ Set' : '❌ NOT SET'}`);
      console.log(`  ├─ razorpay_key_secret:    ${settings.razorpay_key_secret ? '✅ Set' : '❌ NOT SET'}`);
      console.log(`  └─ razorpay_webhook_secret: ${settings.razorpay_webhook_secret ? '✅ Set' : '❌ NOT SET'}`);

      if (settings.razorpay_key_id) {
        console.log(`\n  Key ID starts with: ${settings.razorpay_key_id.substring(0, 15)}...`);
        if (settings.razorpay_key_id.includes('YOUR_KEY_ID')) {
          console.log('  ⚠️  WARNING: This looks like a placeholder value!');
        }
      }
    }

    // Check tables exist
    console.log('\n📊 Database Tables:');
    const tables = ['saas_purchases', 'platform_settings', 'users'];
    for (const table of tables) {
      const check = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
        [table]
      );
      const exists = check.rows.length > 0;
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }

    // Check recent orders
    console.log('\n📦 Recent Purchase Orders:');
    const orders = await client.query(
      `SELECT id, plan_key, amount, status, razorpay_order_id, created_at 
       FROM saas_purchases 
       ORDER BY created_at DESC 
       LIMIT 5`
    );
    
    if (orders.rows.length === 0) {
      console.log('  No orders found');
    } else {
      orders.rows.forEach((order, idx) => {
        console.log(`  ${idx + 1}. ${order.id}`);
        console.log(`     ├─ Plan: ${order.plan_key}`);
        console.log(`     ├─ Amount: ₹${order.amount}`);
        console.log(`     ├─ Status: ${order.status}`);
        console.log(`     ├─ Order ID: ${order.razorpay_order_id || 'NOT SET'}`);
        console.log(`     └─ Created: ${order.created_at}`);
      });
    }

    console.log('\n━'.repeat(60));
    console.log('\n✅ Diagnostic Complete\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

checkRazorpayConfig();
