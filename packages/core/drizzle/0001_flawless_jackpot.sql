CREATE TABLE "shopify_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"shop" text NOT NULL,
	"state" text NOT NULL,
	"isOnline" boolean DEFAULT false NOT NULL,
	"scope" text,
	"expires" timestamp,
	"accessToken" text NOT NULL,
	"userId" bigint,
	"firstName" text,
	"lastName" text,
	"email" text,
	"accountOwner" boolean,
	"locale" text,
	"collaborator" boolean,
	"emailVerified" boolean,
	"refreshToken" text,
	"refreshTokenExpires" timestamp
);
