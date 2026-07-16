export default interface Team {
  team_id: string
  season_id: string
  abbreviation: string
  city: string
  mascot: string
  tv_code: string
  conference: 'AFC' | 'NFC'
  division: 'North' | 'South' | 'East' | 'West'
  timezone: 0 | 1 | 2 | 3  // 0=Eastern, 1=Central, 2=Mountain, 3=Pacific
}
