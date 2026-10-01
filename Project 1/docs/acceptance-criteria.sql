WITH linked AS (
    SELECT DISTINCT i.keyid1, i.paramlistid, i.paramlistversionid,
        i.variantid, i.dataset, i.paramid, i.paramtype, i.replicateid,
        i.specid, i.specversionid, i.waivedflag
    FROM s_sample s
    JOIN sdidataitemspec i ON i.sdcid = 'Sample' AND i.keyid1 = s.s_sampleid
    WHERE s.securitydepartment = 'FWN'
        AND regexp_like(s.locationpath, '^FWN UT /.* / (North / (PW|WFI|CS|Pretreatment)|South / (CS|Pretreatment)|South L15 / CS|South L(10|15|20) / PW) /')
        AND coalesce(s.collectiondt, s.eventdt) >= TIMESTAMP '{{HISTORY_START}} 00:00:00'
        AND coalesce(s.collectiondt, s.eventdt) < TIMESTAMP '{{END_EXCLUSIVE}} 00:00:00'
        AND i.paramid IN ('TOC', 'Conductivity Stage 1', 'Conductivity Stage 2',
            'Conductivity Stage 3', 'Micro Count', 'LAL Endotoxin',
            'Nitrates', 'Coliforms', 'Color', 'Clarity')
), criteria AS (
    SELECT ARRAY[
        i.keyid1, i.paramlistid, i.paramlistversionid, i.variantid,
        CAST(i.dataset AS varchar), i.paramid, i.paramtype, CAST(i.replicateid AS varchar),
        i.specid, i.specversionid, sp.versionstatus, sp.activeflag,
        lt.limittypeid, lim.operator1, lim.value1, lim.operator2, lim.value2,
        lim.unitsid, i.waivedflag, CAST(sp.versionapproveddt AS varchar),
        item.limitlabel, item.paramlistversionid, item.allowanyparamlistflag
    ] AS record,
    row_number() OVER (ORDER BY i.keyid1, i.paramlistid, i.dataset,
        i.paramid, i.replicateid, i.specid, lim.limittypesequence) AS row_number
    FROM linked i
    LEFT JOIN spec sp ON sp.specid = i.specid AND sp.specversionid = i.specversionid
    LEFT JOIN specparamitems item ON item.specid = i.specid
        AND item.specversionid = i.specversionid AND item.paramlistid = i.paramlistid
        AND (item.paramlistversionid = i.paramlistversionid OR item.allowanyparamlistflag = 'V')
        AND item.variantid = i.variantid AND item.paramid = i.paramid AND item.paramtype = i.paramtype
    LEFT JOIN specparamlimits lim ON lim.specid = item.specid
        AND lim.specversionid = item.specversionid AND lim.paramlistid = item.paramlistid
        AND lim.paramlistversionid = item.paramlistversionid AND lim.variantid = item.variantid
        AND lim.paramid = item.paramid AND lim.paramtype = item.paramtype
    LEFT JOIN speclimittype lt ON lt.specid = lim.specid
        AND lt.specversionid = lim.specversionid AND lt.limittypesequence = lim.limittypesequence
)
SELECT json_format(CAST(array_agg(record ORDER BY row_number) AS JSON)) AS payload
FROM criteria
GROUP BY floor((row_number - 1) / 100.0)
ORDER BY floor((row_number - 1) / 100.0);