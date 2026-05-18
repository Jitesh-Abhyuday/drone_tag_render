-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "device_id" VARCHAR(100),
    "created_at" VARCHAR,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" SERIAL NOT NULL,
    "device_id" VARCHAR(100),
    "latitude" VARCHAR(225),
    "longitude" VARCHAR(225),
    "timestamp" VARCHAR,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_id_key" ON "devices"("device_id");
