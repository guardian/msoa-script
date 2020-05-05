/* helper functions and libraries */
const csvParse = require('csv-parse/lib/sync')
const fs = require('fs')
const d3 = require('d3')

const sumVals = (arr, key) => arr.map(v => v[key]).reduce((a, b) => a + b) // sum all the values in an array based on chosen key

const toDict = (arr, key) => { //creates a dictionary for a collection based on a chosen key
    const out = {}
    arr.forEach(o => out[o[key]] = o)

    return out
}
/* import necessary datasets */
const msoaCsv = fs.readFileSync('./data/msoa_lookup.csv', 'utf-8')
const lsoaPopCsv = fs.readFileSync('./data/lsoa_population.csv', 'utf-8')
const lsoaImdCsv = fs.readFileSync('./data/lsoa_imd.csv', 'utf-8')
const deathsCsv = fs.readFileSync('./data/deaths.csv', 'utf-8')
const scoresCsv = fs.readFileSync('./data/imd_scores.csv', 'utf-8')
const msoaPopulationCsv = fs.readFileSync('./data/msoa_population_2018.csv', 'utf-8')

/* parse datasets to js object */
const msoaObj = csvParse(msoaCsv, { columns: true })
const lsoaPopObj = csvParse(lsoaPopCsv, { columns: true })
const lsoaImdObj = csvParse(lsoaImdCsv, { columns: true })
const deathsObj = csvParse(deathsCsv, { columns: true })
const scoresObj = csvParse(scoresCsv, { columns: true })
const msoaPopulationObj = csvParse(msoaPopulationCsv, { columns: true })

/* create dictionaries to be used for lookups */
const popdict = toDict(lsoaPopObj, 'lsoa_code')
const imdDict = toDict(lsoaImdObj, 'lsoa_code')
const imdScoreDict = toDict(scoresObj, 'lsoa_code')
const deathsDict = toDict(deathsObj, 'ons_id')
const msoaPopDict = toDict(msoaPopulationObj, 'msoa_code')

/* join lsoa population data */
const withPopulation = msoaObj.map(d => {
    const match = popdict[d.lsoa_code]

    if (match) {
        d.total_population = Number(match.lsoa_total_population)
    } else {
        d.total_population = 'not available'
    }

    return d
})

/* Add imd deciles */
const withImd = withPopulation.map(d => {
    const match = imdDict[d.lsoa_code]

    if (match) {
            // d.IMDRank = Number(match.IMDRank),
            d.IMDDecil = Number(match.IMDDecil)
    } else {
        d.no_imd_match = true
    }
    return d
})

/* Add imd scores */
const withImdScores = withImd.map(d => {
    const match = imdScoreDict[d.lsoa_code]

    if (match) {
        d.IMDScore = Number(match.IMDScore)
    } else {
        d.no_imd_score_match = true
    }
    return d
})

/* filter everything that doesn't have population data or imd indexes */
const filtered = withImdScores
    .filter(d => d.no_imd_match !== true) 
    .filter(d => d.no_imd_score_match !== true)
    .filter(d => d.total_population !== 'not available')

/* weigth imd indexes by population */
const weighted = filtered.map(d => {
    // d.IMDRank_w = d.IMDRank * d.total_population
    d.IMDDecil_w = d.IMDDecil * d.total_population
    d.IMDScore_w = d.IMDScore * d.total_population

    return d
})

/* Nest by msoa */
const groupedByMsoa = d3.nest()
    .key(d => d.msoa_code)
    .entries(weighted)

/* aggregate the populations and the imd values */

const withAggregates = groupedByMsoa.map(d => {
    d.aggrPop = sumVals(d.values, 'total_population')
    // d.aggrIMDRank = sumVals(d.values, 'IMDRank_w')
    d.aggrIMDDecil = sumVals(d.values, 'IMDDecil_w')
    d.aggrIMDScore = sumVals(d.values, 'IMDScore_w')

    return d
})

/* Calculate indexes by dividing the aggregates by aggr. population */

const final = withAggregates.map(d => {
    // d.IMDRank = d.aggrIMDRank / d.aggrPop
    d.IMDDecil = d.aggrIMDDecil / d.aggrPop
    d.IMDScore = d.aggrIMDScore / d.aggrPop
    d.code = d.key
    d.name = d.values[0].msoa_name
    
    delete d.key
    delete d.values
    delete d.aggrPop
    delete d.aggrIMDDecil
    delete d.aggrIMDScore
    // delete d.aggrIMDRank

    return d
})

/* add separate msoa population data (this is from an external dataset. In order to calculate covid deaths per person I thought it would be better to use actual figures msoa instead of the aggregate of lsoa popuplations) */

const finalWithPopulation = final.map(d => {
    const match = msoaPopDict[d.code]

    if (match) {
        d.msoa_population = Number(match['msoa_population'])
    } else {
        d.msoa_population = 'not available'
    }

    return d
})

/* Add covid-19 deaths */
const finalWithDeaths = finalWithPopulation.map(d => {
    const match = deathsDict[d.code]
  
    if (match && d.msoa_population !== 'not available') {
        d.covid_death_rate = Number(match['COVID-19']) / d.msoa_population
    } else {
        d.covid_deaths = 'not available'
    }

    return d
})
/* Write to file */
fs.writeFileSync('./output/final.json', JSON.stringify(final))
fs.writeFileSync('./output/final_with_deaths.json', JSON.stringify(finalWithDeaths))

console.log('done')