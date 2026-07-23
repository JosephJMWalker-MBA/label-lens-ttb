ALTER TABLE `submitted_panels`
  MODIFY COLUMN `id` varchar(255) NOT NULL,
  MODIFY COLUMN `storage_key` varchar(1024) NOT NULL;
