class Skin {
  constructor(name, skinName, price, minRange, maxRange, chance) {
    this.name = name
    this.skinName = skinName
    this.price = price
    this.minRange = minRange
    this.maxRange = maxRange
    this.chance = chance
  }
}

// Стоимость кейса в долларах
const CASE_COST = 2.75

// Определение всех скинов с их диапазонами и шансами
const skins = [
  new Skin('MP9', 'Featherweight', 0.04, 95801, 100000, 4.201),
  new Skin('P250', 'Re.built', 0.04, 91600, 95800, 4.201),
  new Skin('SG 553', 'Cyberforce', 0.04, 87399, 91599, 4.201),
  new Skin('SCAR-20', 'Fragments', 0.04, 83198, 87398, 4.201),
  new Skin('Tec-9', 'Rebel', 0.04, 78997, 83197, 4.201),
  new Skin('MAG-7', 'Insomnia', 0.04, 74796, 78996, 4.201),
  new Skin('MP5-SD', 'Liquidation', 0.06, 71324, 74795, 3.472),
  new Skin('MP5-SD', 'Liquidation', 0.12, 68817, 71323, 2.507),
  new Skin('SCAR-20', 'Fragments', 0.12, 66310, 68816, 2.507),
  new Skin('P250', 'Re.built', 0.12, 63803, 66309, 2.507),
  new Skin('MP9', 'Featherweight', 0.12, 61296, 63802, 2.507),
  new Skin('MP5-SD', 'Liquidation', 0.13, 58881, 61295, 2.415),
  new Skin('Tec-9', 'Rebel', 0.13, 56466, 58880, 2.415),
  new Skin('MP9', 'Featherweight', 0.13, 54051, 56465, 2.415),
  new Skin('P250', 'Re.built', 0.13, 51636, 54050, 2.415),
  new Skin('SCAR-20', 'Fragments', 0.13, 49221, 51635, 2.415),
  new Skin('Tec-9', 'Rebel', 0.13, 46806, 49220, 2.415),
  new Skin('MAG-7', 'Insomnia', 0.14, 44474, 46805, 2.332),
  new Skin('SG 553', 'Cyberforce', 0.14, 42142, 44473, 2.332),
  new Skin('MAG-7', 'Insomnia', 0.15, 39884, 42141, 2.258),
  new Skin('SG 553', 'Cyberforce', 0.15, 37626, 39883, 2.258),
  new Skin('SCAR-20', 'Fragments', 0.3, 35995, 37625, 1.631),
  new Skin('Tec-9', 'Rebel', 0.31, 34389, 35994, 1.606),
  new Skin('MAG-7', 'Insomnia', 0.31, 32783, 34388, 1.606),
  new Skin('MP5-SD', 'Liquidation', 0.32, 31201, 32782, 1.582),
  new Skin('MP9', 'Featherweight', 0.32, 29619, 31200, 1.582),
  new Skin('P250', 'Re.built', 0.32, 28037, 29618, 1.582),
  new Skin('MAC-10', 'Sakkaku', 0.33, 26478, 28036, 1.559),
  new Skin('R8 Revolver', 'Banana Cannon', 0.34, 24941, 26477, 1.537),
  new Skin('SG 553', 'Cyberforce', 0.34, 23404, 24940, 1.537),
  new Skin('P90', 'Neoqueen', 0.42, 22012, 23403, 1.392),
  new Skin('R8 Revolver', 'Banana Cannon', 0.53, 20764, 22011, 1.248),
  new Skin('Glock-18', 'Umbral Bunny', 0.62, 19605, 20763, 1.159),
  new Skin('M4A1-S', 'Emphorosaur-S', 0.79, 18570, 19604, 1.035),
  new Skin('MAC-10', 'Sakkaku', 0.8, 17541, 18569, 1.029),
  new Skin('P90', 'Neoqueen', 0.86, 16547, 17540, 0.994),
  new Skin('R8 Revolver', 'Banana Cannon', 0.88, 15563, 16546, 0.984),
  new Skin('Glock-18', 'Umbral Bunny', 0.94, 14609, 15562, 0.954),
  new Skin('M4A1-S', 'Emphorosaur-S', 1.03, 13695, 14608, 0.914),
  new Skin('P90', 'Neoqueen', 1.05, 12790, 13694, 0.905),
  new Skin('MAC-10', 'Sakkaku', 1.42, 12004, 12789, 0.786),
  new Skin('Glock-18', 'Umbral Bunny', 1.44, 11224, 12003, 0.78),
  new Skin('R8 Revolver', 'Banana Cannon', 1.5, 10458, 11223, 0.766),
  new Skin('P90', 'Neoqueen', 1.56, 9706, 10457, 0.752),
  new Skin('P2000', 'Wicked Sick', 1.89, 9019, 9705, 0.687),
  new Skin('UMP-45', 'Wild Child', 1.9, 8334, 9018, 0.685),
  new Skin('Glock-18', 'Umbral Bunny', 2.26, 7702, 8333, 0.632),
  new Skin('M4A1-S', 'Emphorosaur-S', 2.83, 7134, 7701, 0.568),
  new Skin('MAC-10', 'Sakkaku', 2.87, 6569, 7133, 0.565),
  new Skin('P2000', 'Wicked Sick', 3.03, 6019, 6568, 0.55),
  new Skin('UMP-45', 'Wild Child', 3.18, 5481, 6018, 0.538),
  new Skin('AWP', 'Duality', 3.21, 4945, 5480, 0.536),
  new Skin('M4A1-S', 'Emphorosaur-S', 4.08, 4466, 4944, 0.479),
  new Skin('UMP-45', 'Wild Child', 4.58, 4013, 4465, 0.453),
  new Skin('P2000', 'Wicked Sick', 5.2, 3586, 4012, 0.427),
  new Skin('AWP', 'Duality', 5.7, 3177, 3585, 0.409),
  new Skin('AK-47', 'Head Shot', 8.35, 2835, 3176, 0.342),
  new Skin('AWP', 'Duality', 9.75, 2517, 2834, 0.318),
  new Skin('P2000', 'Wicked Sick', 10.38, 2208, 2516, 0.309),
  new Skin('UMP-45', 'Wild Child', 10.41, 1900, 2207, 0.308),
  new Skin('AWP', 'Duality', 14.26, 1634, 1899, 0.266),
  new Skin('M4A4', 'Temukau', 14.83, 1373, 1633, 0.261),
  new Skin('AK-47', 'Head Shot', 21.25, 1153, 1372, 0.22),
  new Skin('AK-47', 'Head Shot', 27.73, 958, 1152, 0.195),
  new Skin('M4A4', 'Temukau', 40.65, 795, 957, 0.163),
  new Skin('M4A4', 'Temukau', 50.66, 648, 794, 0.147),
  new Skin('AK-47', 'Head Shot', 51.21, 502, 647, 0.146),
  new Skin('M4A4', 'Temukau', 108.61, 400, 501, 0.102),
  new Skin('★ Moto Gloves', 'Transport', 115.69, 301, 399, 0.099),
  new Skin('★ Moto Gloves', 'Transport', 177.14, 220, 300, 0.081),
  new Skin('★ Hand Wraps', 'Overprint', 222.39, 147, 219, 0.073),
  new Skin('★ Specialist Gloves', 'Fade', 342.25, 87, 146, 0.06),
  new Skin('★ Hand Wraps', 'Overprint', 403.33, 32, 86, 0.055),
  new Skin('★ Specialist Gloves', 'Fade', 1342.62, 1, 31, 0.031),
]

function simulateCaseOpening() {
  const roll = Math.floor(Math.random() * 100000) + 1
  return (
    skins.find(skin => roll >= skin.minRange && roll <= skin.maxRange) || null
  )
}

function runSimulation(numOpenings = 1000) {
  const results = []
  const totalCost = numOpenings * CASE_COST
  let totalValue = 0

  for (let i = 0; i < numOpenings; i++) {
    const skin = simulateCaseOpening()
    if (skin) {
      results.push(skin)
      totalValue += skin.price
    }
  }

  const profit = totalCost - totalValue
  const profitPercentage = (profit / totalCost) * 100

  // Создаем сводку результатов
  const skinCounts = {}
  results.forEach(skin => {
    const key = `${skin.name} ${skin.skinName} ($${skin.price})`
    skinCounts[key] = (skinCounts[key] || 0) + 1
  })

  console.log(`\nРезультаты симуляции (${numOpenings} открытий кейсов):`)
  console.log(`Общая стоимость кейсов: $${totalCost.toFixed(2)}`)
  console.log(`Общая стоимость выигрышей игроков: $${totalValue.toFixed(2)}`)
  console.log(`Прибыль/Убыток: $${profit.toFixed(2)}`)
  console.log(`Процент прибыли/убытка: ${profitPercentage.toFixed(2)}%`)

  console.log('\nВыданные предметы:')
  Object.entries(skinCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([skin, count]) => {
      console.log(`${skin}: ${count} раз`)
    })
}

// Запускаем симуляцию
runSimulation(1000)
