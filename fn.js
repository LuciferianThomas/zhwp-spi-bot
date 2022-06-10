const { mwn } = require( 'mwn' ),
      moment = require( 'moment' ),
      jquery = require( 'jquery' ),
      { JSDOM } = require( 'jsdom' )

const time = ( date = moment(), format = "YYYY-MM-DD HH:mm" ) => {
  return moment( date ).utcOffset( 8 ).format( format )
}

const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const win = new ( JSDOM )( '' ).window
const $ = jquery( win, true )

module.exports = {
  time,
  capitalize,
  $
}