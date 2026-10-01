WITH joined AS (
    SELECT s.s_sampleid, upper(trim(d.displayvalue)) AS outcome,
        CAST(t.transformdt AS date) AS test_date,
           CASE WHEN regexp_like(s.sampledesc, '^\s*\d{1,2}\s*-\s*\S')
               THEN try_cast(regexp_extract(s.sampledesc, '^\s*(\d{1,2})\s*-', 1) AS integer)
           END AS equipment_number
    FROM s_sample s
    JOIN sdidataitem d ON d.sdcid = 'Sample' AND d.keyid1 = s.s_sampleid
    LEFT JOIN sdidataitem t ON t.sdcid = d.sdcid AND t.keyid1 = d.keyid1
        AND t.paramlistid = d.paramlistid AND t.paramlistversionid = d.paramlistversionid
        AND t.variantid = d.variantid AND t.dataset = d.dataset
        AND t.replicateid = d.replicateid AND t.paramid = 'TEST DATE'
    WHERE s.securitydepartment = 'FWN' AND s.sampletypeid = 'Sterilizer Cycle'
        AND coalesce(s.templateflag, 'N') <> 'Y'
        AND lower(coalesce(s.samplestatus, '')) NOT LIKE '%cancel%'
        AND d.paramid IN ('CYCLE AUDIT', 'CYCLE RESULTS')
        AND d.paramlistid <> 'CIP/SIP CYCLE REQUEST'
        AND upper(trim(d.displayvalue)) IN ('PASS', 'FAIL') AND d.releasedflag = 'Y'
        AND (t.transformdt IS NULL OR
            (t.transformdt >= TIMESTAMP '{{HISTORY_START}} 00:00:00'
             AND t.transformdt < TIMESTAMP '{{END_EXCLUSIVE}} 00:00:00'))
), classified AS (
    SELECT *, CASE WHEN equipment_number IN (18, 29, 32) THEN 'Oven' ELSE 'Sterilizer' END AS kind
    FROM joined
), samples AS (
    SELECT s_sampleid, min(kind) AS kind, min(equipment_number) AS equipment_number,
        min(test_date) AS test_date, min(outcome) AS outcome
    FROM classified
    GROUP BY s_sampleid
    HAVING count(DISTINCT outcome) = 1 AND count(DISTINCT equipment_number) = 1
        AND count(DISTINCT kind) = 1 AND count(DISTINCT test_date) = 1
        AND count_if(equipment_number IS NULL OR equipment_number = 0 OR test_date IS NULL) = 0
), counts AS (
    SELECT kind, equipment_number, outcome, count(*) AS total,
        count_if(test_date >= DATE '{{INITIAL_START}}') AS initial_total
    FROM samples GROUP BY kind, equipment_number, outcome
)
SELECT json_format(CAST(array_agg(ARRAY[kind, CAST(equipment_number AS varchar), outcome,
    CAST(total AS varchar), CAST(initial_total AS varchar)] ORDER BY kind, equipment_number, outcome) AS JSON)) AS payload
FROM counts;