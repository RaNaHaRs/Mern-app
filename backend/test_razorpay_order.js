#!/usr/bin/env node
/**
 * Test script to verify Razorpay order creation works
 * Usage: node test_razorpay_order.js [key_id] [key_secret] [amount]
 * 
 * Example:
 *   node test_razorpay_order.js rzp_test_abc123 secret_xyz 10000
 */

require('dotenv').config();
const razorpayService = require('./src/services/razorpayService');
const logger = require('./src/config/logger');

const keyId = process.argv[2] || process.env.RAZORPAY_KEY_ID;
const keySecret = process.argv[3] || process.env.RAZORPAY_KEY_SECRET;
const amount = process.argv[4] || 10000; // Default: 100 rupees in paise

console.log('\n🧪 Razorpay Order Creation Test\n');
console.log('━'.repeat(60));

if (!keyId || !keySecret) {
  console.error('❌ Error: Razorpay credentials not provided');
  console.error('\nUsage:');
  console.error('  node test_razorpay_order.js [key_id] [key_secret] [amount]');
  console.error('\nExample:');
  console.error('  node test_razorpay_order.js rzp_test_abc123 secret_xyz 10000');
  console.error('\nOr set in .env:');
  console.error('  RAZORPAY_KEY_ID=...');
  console.error('  RAZORPAY_KEY_SECRET=...');
  process.exit(1);
}

// Check for placeholder values
if (keyId.includes('YOUR_KEY_ID') || keySecret.includes('YOUR_RAZORPAY_KEY_SECRET')) {
  console.error('❌ Error: Razorpay credentials are still placeholder values');
  console.error('   Please update .env with real credentials');
  process.exit(1);
}

console.log(`📋 Configuration:`);
console.log(`   Key ID:     ${keyId.substring(0, 15)}...`);
console.log(`   Key Secret: ${keySecret.substring(0, 15)}...`);
console.log(`   Amount:     ₹${Math.round(amount / 100)}`);
console.log(`   Currency:   INR`);
console.log();

async function testOrderCreation() {
  try {
    console.log('🚀 Creating Razorpay order...\n');

    const order = await razorpayService.createOrder({
      amount: Math.round(amount / 100), // Convert paise to rupees
      currency: 'INR',
      receipt: `test-${Date.now()}`,
      notes: {
        test: true,
        createdAt: new Date().toISOString(),
      },
      keyId,
      keySecret,
    });

    if (!order || !order.id) {
      throw new Error('No order returned from Razorpay');
    }

    console.log('✅ SUCCESS! Order created:\n');
    console.log(`   Order ID:      ${order.id}`);
    console.log(`   Amount:        ₹${order.amount / 100}`);
    console.log(`   Currency:      ${order.currency}`);
    console.log(`   Status:        ${order.status}`);
    console.log(`   Receipt:       ${order.receipt}`);
    console.log(`   Created At:    ${order.created_at}`);
    console.log();
    console.log('━'.repeat(60));
    console.log('✅ Razorpay is properly configured!');
    console.log();

  } catch (err) {
    console.error('❌ FAILED! Error:\n');
    console.error(`   Message: ${err.message}`);
    console.error();
    
    if (err.message.includes('Invalid API key')) {
      console.error('   → Your API Key ID or Secret is invalid');
      console.error('   → Check Razorpay dashboard for correct credentials');
    } else if (err.message.includes('Unauthorized')) {
      console.error('   → Credentials are invalid');
      console.error('   → Make sure you\'re using TEST keys (rzp_test_...)');
    } else if (err.message.includes('Network')) {
      console.error('   → Network error connecting to Razorpay');
      console.error('   → Check your internet connection');
    }
    
    console.error();
    console.error('━'.repeat(60));
    console.error('❌ Razorpay configuration needs attention\n');
    process.exit(1);
  }
}

testOrderCreation();
