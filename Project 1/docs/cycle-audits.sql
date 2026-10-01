WITH equipment AS (
    SELECT keyid1,
        array_join(array_sort(array_distinct(array_agg(trim(textvalue))
            FILTER (WHERE attributeid = 'Sterilizer_Num' AND nullif(trim(textvalue), '') IS NOT NULL))), '|') AS equipment,
        array_join(array_distinct(array_agg(textvalue)
            FILTER (WHERE attributeid = 'Cycle_Description')), ' | ') AS cycle_description
    FROM sdiattribute
    WHERE sdcid = 'Sample' AND attributeid IN ('Sterilizer_Num', 'Cycle_Description')
    GROUP BY keyid1
), results AS (
    SELECT s.s_sampleid, s.sampledesc, s.samplestatus, a.equipment, a.cycle_description,
        d.paramlistid, d.paramlistversionid, d.variantid, d.dataset,
        d.paramid, d.paramtype, d.replicateid, d.displayvalue, d.releasedflag,
        d.moddt, t.transformdt AS testdt, t.displayvalue AS test_date_raw,
        row_number() OVER (ORDER BY s.s_sampleid, d.paramlistid, d.dataset, d.replicateid) AS row_number
    FROM s_sample s
    JOIN sdidataitem d ON d.sdcid = 'Sample' AND d.keyid1 = s.s_sampleid
    LEFT JOIN equipment a ON a.keyid1 = s.s_sampleid
    LEFT JOIN sdidataitem t ON t.sdcid = d.sdcid AND t.keyid1 = d.keyid1
        AND t.paramlistid = d.paramlistid AND t.paramlistversionid = d.paramlistversionid
        AND t.variantid = d.variantid AND t.dataset = d.dataset
        AND t.replicateid = d.replicateid AND t.paramid = 'TEST DATE'
    WHERE s.securitydepartment = 'FWN' AND s.sampletypeid = 'Sterilizer Cycle'
        AND coalesce(s.templateflag, 'N') <> 'Y'
        AND lower(coalesce(s.samplestatus, '')) NOT LIKE '%cancel%'
        AND d.paramid IN ('CYCLE AUDIT', 'CYCLE RESULTS')
        AND d.paramlistid <> 'CIP/SIP CYCLE REQUEST'
        AND (t.transformdt IS NULL OR
            (t.transformdt >= TIMESTAMP '{{HISTORY_START}} 00:00:00'
             AND t.transformdt < TIMESTAMP '{{END_EXCLUSIVE}} 00:00:00'))
)
SELECT json_format(CAST(array_agg(ARRAY[
    s_sampleid, sampledesc, samplestatus, equipment, cycle_description,
    paramlistid, paramlistversionid, variantid, CAST(dataset AS varchar),
    paramid, paramtype, CAST(replicateid AS varchar), displayvalue, releasedflag,
    CAST(moddt AS varchar), CAST(testdt AS varchar), test_date_raw
] ORDER BY row_number) AS JSON)) AS payload
FROM results
GROUP BY floor((row_number - 1) / 100.0)
ORDER BY floor((row_number - 1) / 100.0);