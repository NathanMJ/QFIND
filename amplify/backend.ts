import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { presignedUrlFunction } from './functions/presigned-url/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
defineBackend({
  auth,
  data,
  storage,
  presignedUrlFunction
});

// Grant the Lambda read access to the S3 bucket
const s3Bucket = backend.storage.resources.bucket;
const lambdaFn = backend.PresignedUrlFunction.resources.lambda;

s3Bucket.grantRead(lambdaFn);
lambdaFn.addEnvironment("S3_BUCKET_NAME", s3Bucket.bucketName);
