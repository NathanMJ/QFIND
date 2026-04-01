 import type { APIGatewayProxyHandler } from "aws-lambda"; 
 import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"; 
 import { getSignedUrl } from "@aws-sdk/s3-request-presigner"; 
 
 export const handler: APIGatewayProxyHandler = async (event) => { 
 const s3Client = new S3Client({ region: process.env.AWS_REGION }); 
 
 try { 
 const { key } = JSON.parse(event.body || '{}'); 
 
 if (!key) { 
 return { 
 statusCode: 400, 
 headers: { 
 "Access-Control-Allow-Origin": "*", 
 "Access-Control-Allow-Headers": "*", 
 }, 
 body: JSON.stringify({ error: "Object key is required" }), 
 }; 
 } 
 
 const command = new GetObjectCommand({ 
 Bucket: process.env.BUCKET_NAME, 
 Key: key, 
 }); 
 
 const presignedUrl = await getSignedUrl(s3Client, command, { 
 expiresIn: 3600, // 1 hour 
 }); 
 
 return { 
 statusCode: 200, 
 headers: { 
 "Access-Control-Allow-Origin": "*", 
 "Access-Control-Allow-Headers": "*", 
 }, 
 body: JSON.stringify({ presignedUrl }), 
 }; 
 } catch (error) { 
 return { 
 statusCode: 500, 
 headers: { 
 "Access-Control-Allow-Origin": "*", 
 "Access-Control-Allow-Headers": "*", 
 }, 
 body: JSON.stringify({ error: "Failed to generate presigned URL" }), 
 }; 
 } 
 }; 
