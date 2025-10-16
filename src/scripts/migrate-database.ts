#!/usr/bin/env ts-node

/**
 * Complete database migration workflow
 * 1. Export all data
 * 2. Reset database with new schema
 * 3. Import and transform data
 */

import { execSync } from 'child_process';
import { exportData } from './export-data';
import { importData } from './import-data';
import * as readline from 'readline';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function migrateDatabaseWithData() {
  console.log('\n🚀 DATABASE MIGRATION WITH DATA PRESERVATION');
  console.log('='.repeat(50));
  console.log('\nThis will:');
  console.log('  1. Export all current data');
  console.log('  2. Reset database with new schema');
  console.log('  3. Import and transform your data\n');

  const answer = await prompt('Continue? (yes/no): ');
  
  if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
    console.log('❌ Migration cancelled');
    process.exit(0);
  }

  try {
    // Step 1: Export data
    console.log('\n' + '='.repeat(50));
    console.log('STEP 1: EXPORTING DATA');
    console.log('='.repeat(50) + '\n');
    
    const backupPath = await exportData();
    
    console.log('\n✅ Export completed!\n');
    console.log('Press Enter to continue with migration...');
    await prompt('');

    // Step 2: Reset database with new schema
    console.log('\n' + '='.repeat(50));
    console.log('STEP 2: RESETTING DATABASE');
    console.log('='.repeat(50) + '\n');
    
    console.log('⚠️  This will drop all tables and recreate them!\n');
    const resetAnswer = await prompt('Proceed with database reset? (yes/no): ');
    
    if (resetAnswer.toLowerCase() !== 'yes' && resetAnswer.toLowerCase() !== 'y') {
      console.log('❌ Migration cancelled');
      console.log(`📁 Your data backup is saved at: ${backupPath}`);
      process.exit(0);
    }

    console.log('\n🔄 Running prisma migrate reset...\n');
    execSync('npx prisma migrate reset --force', { stdio: 'inherit' });
    
    console.log('\n✅ Database reset completed!\n');

    // Step 3: Import data
    console.log('\n' + '='.repeat(50));
    console.log('STEP 3: IMPORTING DATA');
    console.log('='.repeat(50) + '\n');
    
    await importData(backupPath);

    // Success!
    console.log('\n' + '='.repeat(50));
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log(`\n📁 Backup preserved at: ${backupPath}`);
    console.log('\n✅ Your database is now using the new schema');
    console.log('✅ All your data has been preserved and transformed\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\n⚠️  Your original data is backed up.');
    console.error('You can manually import it using: npm run import-data\n');
    process.exit(1);
  }
}

// Run
migrateDatabaseWithData();

