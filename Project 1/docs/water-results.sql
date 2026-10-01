WITH results AS (
    SELECT s.s_sampleid, coalesce(s.collectiondt, s.eventdt) AS sampledt,
        s.collectiondt, s.eventdt, s.samplepointid, s.locationpath,
        s.sampledesc, s.samplestatus,
        CASE
            WHEN regexp_like(s.locationpath, '/ North / (PW|WFI) /')
                THEN trim(regexp_extract(s.locationpath, '/ North / ([^/]+)', 1))
            WHEN s.locationpath LIKE '% / North / CS /%' THEN 'CS-North'
            WHEN regexp_like(s.locationpath, '/ (South|South L15) / CS /') THEN 'CS-South'
            WHEN s.locationpath LIKE '% / North / Pretreatment /%' THEN 'Pretreatment-North'
            WHEN s.locationpath LIKE '% / South / Pretreatment /%' THEN 'Pretreatment-South'
            WHEN regexp_like(s.locationpath, '/ South L(10|15|20) / PW /') THEN 'PW-South'
        END AS water,
        d.paramlistid, d.paramlistversionid, d.variantid, d.dataset,
        d.paramid, d.paramtype, d.replicateid, d.displayvalue, d.displayunits,
        d.enteredtext, d.enteredoperator, d.enteredqualifier, d.releasedflag,
        row_number() OVER (ORDER BY coalesce(s.collectiondt, s.eventdt), s.s_sampleid,
            d.paramlistid, d.paramlistversionid, d.variantid, d.dataset,
            d.paramid, d.paramtype, d.replicateid) AS row_number
    FROM s_sample s
    JOIN sdidataitem d ON d.sdcid = 'Sample' AND d.keyid1 = s.s_sampleid
    WHERE s.securitydepartment = 'FWN'
        AND regexp_like(s.locationpath, '^FWN UT /.* / (North / (PW|WFI|CS|Pretreatment)|South / (CS|Pretreatment)|South L15 / CS|South L(10|15|20) / PW) /')
        AND coalesce(s.collectiondt, s.eventdt) >= TIMESTAMP '{{HISTORY_START}} 00:00:00'
        AND coalesce(s.collectiondt, s.eventdt) < TIMESTAMP '{{END_EXCLUSIVE}} 00:00:00'
        AND coalesce(s.templateflag, 'N') <> 'Y'
        AND lower(coalesce(s.samplestatus, '')) NOT LIKE '%cancel%'
        AND (
            (d.paramid = 'TOC' AND d.paramlistid = 'Total Organic Carbon')
            OR (d.paramid = 'Conductivity Stage 1' AND d.paramlistid = 'Conductivity - Stage 1')
            OR (d.paramid = 'Conductivity Stage 2' AND d.paramlistid = 'Conductivity - Stage 2')
            OR (d.paramid = 'Conductivity Stage 3' AND d.paramlistid = 'Conductivity - Stage 3')
            OR (d.paramid = 'LAL Endotoxin' AND d.paramlistid = 'LAL Endotoxin')
            OR (d.paramid = 'Micro Count' AND d.paramlistid = 'Micro Count')
            OR (d.paramid = 'Nitrates' AND d.paramlistid = 'Nitrates')
            OR (d.paramid = 'Coliforms' AND d.paramlistid = 'Coliforms')
            OR (d.paramid = 'Color' AND d.paramlistid = 'ColorV2')
            OR (d.paramid = 'Clarity' AND d.paramlistid = 'ClarityV2')
        )
)
SELECT json_format(CAST(array_agg(ARRAY[
    s_sampleid, CAST(sampledt AS varchar), samplepointid, locationpath,
    sampledesc, samplestatus, water, paramlistid, paramlistversionid,
    variantid, CAST(dataset AS varchar), paramid, paramtype,
    CAST(replicateid AS varchar), displayvalue, displayunits, enteredtext,
    enteredoperator, enteredqualifier, releasedflag,
    CAST(collectiondt AS varchar), CAST(eventdt AS varchar)
] ORDER BY row_number) AS JSON)) AS payload
FROM results
GROUP BY floor((row_number - 1) / 100.0)
ORDER BY floor((row_number - 1) / 100.0);