-- Pull every Capitec place in (and just around) South Africa from Overture Maps.
-- 1. Replace <LATEST_RELEASE> below with the current release name, e.g. 2026-11-19.0
--    (see https://docs.overturemaps.org/release/latest)
-- 2. Run from this folder:  duckdb -c ".read overture-capitec.sql"
-- Output: overture-capitec.json

INSTALL spatial; LOAD spatial;
INSTALL httpfs;  LOAD httpfs;
SET s3_region = 'us-west-2';

COPY (
  SELECT
    * EXCLUDE (geometry),
    ST_Y(geometry) AS lat,
    ST_X(geometry) AS lng
  FROM read_parquet(
    's3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/*',
    hive_partitioning = 1)
  WHERE bbox.xmin BETWEEN 16.3 AND 33.0
    AND bbox.ymin BETWEEN -35.0 AND -22.0
    AND (names.primary ILIKE '%capitec%' OR brand.names.primary ILIKE '%capitec%')
) TO 'overture-capitec.json' (FORMAT JSON, ARRAY true);
