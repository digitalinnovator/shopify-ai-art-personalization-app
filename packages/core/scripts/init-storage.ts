import { bucketName, ensureBucket } from '../src/storage';

const result = await ensureBucket();
console.log(`  bucket ${bucketName()}: ${result}`);
