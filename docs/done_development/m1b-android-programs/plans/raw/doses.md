# T5 dose research log

Date: 2026-11-14. Every dose in `public/data/programs.json` was checked against text read from a fetched page. Nothing was filled in from memory.

## URLs fetched

| URL | How | Result |
|---|---|---|
| https://www.nice.org.uk/guidance/ng123/chapter/Recommendations | WebFetch got 403. Plain `curl` got 200 and the text was read | Read: recs 1.4.4 and 1.4.5 (PFMT dose) |
| https://www.nice.org.uk/guidance/ng210/chapter/Recommendations | WebFetch got 403. Plain `curl` got 200 and the text was read | Read: rec 1.6.14 (PFMT ≥ 3 months for SUI/MUI). It covers women aged 12 and over and gives no contraction count, so it does not change the dose |
| https://www.nice.org.uk/guidance/qs77/chapter/Quality-statement-4-Supervised-pelvic-floor-muscle-training | WebFetch | 403, not read |
| https://nice.org.uk/guidance/ng123/chapter/Recommendations | WebFetch | 403, not read |
| https://www.who.int/publications/i/item/9789240015128 | WebFetch | 200, but the page only links the PDF. No dose text |
| https://iris.who.int/bitstream/handle/10665/336656/9789240015128-eng.pdf | WebFetch got 403. `curl` returned an HTML app shell, not the PDF | Not read |
| https://www.who.int/news-room/fact-sheets/detail/physical-activity | WebFetch | Read: "at least 150 minutes of moderate-intensity physical activity per week". Not used: the guideline paper below has the full text |
| https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:33239350%20AND%20SRC:MED&resultType=core&format=json | curl | Read: abstract of Bull et al. 2020, *WHO 2020 guidelines on physical activity and sedentary behaviour*, Br J Sports Med |
| https://www.ebi.ac.uk/europepmc/webservices/rest/PMC7719906/fullTextXML | curl | Read: the full text of that paper. This is the WHO dose source URL in programs.json |
| https://www.ncbi.nlm.nih.gov/books/NBK542383/, https://www.ncbi.nlm.nih.gov/books/NBK566045/, https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/ | WebFetch | Blocked by a reCAPTCHA browser check, not read |
| https://www.nhs.uk/conditions/urinary-incontinence/treatment/ | WebFetch | Read: "a minimum of 8 muscle contractions at least 3 times a day and last for at least 3 months". This agrees with NG123. Not cited, because it is patient advice, not a guideline |
| https://www.cochrane.org/evidence/CD005654 | WebFetch | Read (claim check) |
| https://pubmed.ncbi.nlm.nih.gov/30979506/, https://pubmed.ncbi.nlm.nih.gov/37814532/ | WebFetch and curl | Blocked (cookie page, HTTP 403). The abstracts were read from Europe PMC instead (next row) |
| https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:30979506%20AND%20SRC:MED&resultType=core&format=json (same for 37814532) | curl | Read: the abstracts of Myers and Smith 2019 and Khera et al. 2023 (claim check) |

## Doses confirmed (11 items)

| Items | Dose in JSON | Quoted text | URL |
|---|---|---|---|
| pelvic-floor/slow-holds, pelvic-floor/quick-squeezes, sexual-health-female/slow-holds, sexual-health-female/quick-squeezes | reps 8, "3 times a day, for at least 3 months (guideline minimum)" | NG123 1.4.4: "Offer a trial of supervised pelvic floor muscle training of at least 3 months' duration as first-line treatment to women with stress or mixed urinary incontinence. [2019]" 1.4.5: "Pelvic floor muscle training programmes should comprise at least 8 contractions performed 3 times per day. [2006]" | https://www.nice.org.uk/guidance/ng123/chapter/Recommendations |
| sexual-health-male/brisk-walking, cycling, running, swimming; sexual-health-female/aerobic-work | "150–300 min a week of moderate aerobic activity, or 75–150 min of vigorous activity, or a mix (weekly total for all aerobic activity)" | "Adults should do at least 150–300 min of moderate-intensity aerobic physical activity, or at least 75–150 min of vigorous-intensity aerobic physical activity, or an equivalent combination of moderate-intensity and vigorous-intensity activity throughout the week for substantial health benefits" | https://www.ebi.ac.uk/europepmc/webservices/rest/PMC7719906/fullTextXML |
| sexual-health-male/whole-body-strength-work, sexual-health-female/strength-work | "2 or more days a week, all major muscle groups, moderate or greater effort" | "Adults should also do muscle-strengthening activities at moderate or greater intensity that involve all major muscle groups on 2 or more days a week, as these provide additional health benefits." | same as above |

Caveats:
- NG123 does not split slow holds from quick squeezes. It gives one minimum for the whole PFMT programme, and the same minimum is set on both items. Hold time is not stated, so there is no `holdSeconds`.
- NG123 covers women with stress or mixed urinary incontinence. The pelvic-floor program is for everyone, and the female sexual-health program copies the same items, so the dose is the guideline's PFMT minimum, not a sexual-health dose.
- The WHO aerobic dose is one weekly total for all aerobic activity together. It is not a separate dose for each of the four male aerobic items.

## Doses left null (42 items)

| Items | Reason |
|---|---|
| posture-correction: all 20 | No guideline was found that gives a dose for these exercises. SPEC §10.1 says the evidence is mixed |
| anterior-pelvic-tilt: all 10 | No guideline was found |
| pelvic-floor/find-the-muscles, pelvic-floor/progress | These are teaching steps. NG123 and NG210 give no dose for them |
| pelvic-floor/diaphragmatic-breathing, deep-squat-hold, happy-baby-pose; sexual-health-female/diaphragmatic-breathing, deep-squat-hold, happy-baby-pose, hip-mobility | These are relaxation and stretch items. No guideline dose was found |
| sexual-health-male/slow-holds, quick-squeezes, control-practice | NG123 and NG210 cover women only. Myers and Smith 2019 state "no optimal training protocol has been identified" |

## Claim check (texts are fixed by PLAN §5 and not changed)
- Cochrane CD005654: the page says "The review included 31 trials" and that women with SUI "were eight times more likely to report cure (56% versus 6%; risk ratio (RR) 8.38". It also says "their sexual outcomes were better". Confirmed.
- Myers and Smith 2019: "Ten trials were included", "low to moderate methodological quality", and "appears effective in treating ED and PE; however, no optimal training protocol has been identified". Confirmed.
- Khera 2023: "11 randomized controlled trials", "mean difference of 2.8 points", "6-30 scale", and a larger effect in men with lower baseline scores. Confirmed. **"1,147 men" is not in the abstract and could not be checked**, because the full text was not fetched. This is an open question for the report.
