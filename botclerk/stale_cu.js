const { mwn } = require( 'mwn' ),
      moment = require( 'moment' )

const CronJob = require('cron').CronJob;

const time = ( date = moment(), format = "YYYY-MM-DD HH:mm" ) => {
  return moment( date ).utcOffset( 8 ).format( format )
}

const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

module.exports = async ( bot, newReqs ) => {
  console.log( newReqs.map( r => r.name ) )
  return;
  for ( var req of newReqs ) {
    let sockListTemplate = req.text.match( /\{\{sock[ _]list\|.*?\}\}/i )[0].split( /\|/g ).filter( m => !( /\{\{sock[ _]list|tools_link=/.test( m ) ) )
    let sockList = sockListTemplate.map( m => m.match( /^(?:\d+=)?(.*?)$/ )[1] )
    let qUsers = await bot.query( {
      list: 'users',
      ususers: sockList.slice( 0, 50 ).join( "|" ),
      usprop: "registration|blockinfo|editcount"
    } )
    let { users: sockUsers } = qUsers.query
    console.log( sockUsers )
    let mainAcc
    let invalid = [], missing = []
    let noEdits = [], stale = []
    let almostStale = []
    for ( var sockUser of sockUsers ) {
      if ( sockUser.invalid ) {
        invalid.push( sockUser.name )
        continue;
      }
      if ( sockUser.missing ) {
        missing.push( sockUser.name )
        continue;
      }
      
      if ( !mainAcc || sockUser.editcount > mainAcc.editcount || sockUser.registration < mainAcc.registration )
        mainAcc = sockUser

      let qContribs = await bot.query( {
        list: 'usercontribs',
        ucuser: sockUser.name,
        uclimit: 1
      } )
      let { usercontribs: lastContrib } = qContribs.query
      // console.log( qContribs.query )
      // console.log( sockUser.name, lastContrib.timestamp, moment.utc( lastContrib.timestamp ) , moment().subtract( 90, 'days' ) )
      if ( !lastContrib.length ) noEdits.push( sockUser.name )
      else if ( moment.utc( lastContrib[0].timestamp ).isBefore( moment().subtract( 90, 'days' ) ) ) stale.push( sockUser.name )
      else if ( moment.utc( lastContrib[0].timestamp ).isBefore( moment().subtract( 83, 'days' ) ) ) almostStale.push( sockUser.name )
    }

    if ( invalid.length + missing.length + noEdits.length + stale.length + almostStale.length == 0 ) continue;
    console.log( invalid )
    console.log( missing )
    console.log( noEdits )
    console.log( stale )
    // console.

    out = "* {{clerk note|機械助理留言}}：自動檢查查核請求發現以下問題。--{{subst:User:LuciferianBot/SPIsign}} ~~~~~\n{| class=wikitable\n! style=\"width:12rem\" | 問題 !! 帳號\n"
    if ( invalid.length ) {
      out += `|-\n| 不能查核IP帳號間或其與註冊帳號的關聯 || ${ invalid.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    if ( missing.length ) {
      out += `|-\n| 用戶未在本地註冊 || ${ missing.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    if ( noEdits.length ) {
      out += `|-\n| 用戶在本地無可見編輯 || ${ noEdits.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    if ( stale.length ) {
      out += `|-\n| 上筆可見編輯已為90天前，可能{{stale}} || ${ stale.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    if ( almostStale.length ) {
      out += `|-\n| 上筆可見編輯已為83天前，可能'''即將'''{{stale}} || ${ almostStale.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    out += `|}\n`
    let newtext = req.text.replace( /(----<!--+ 所有留言請放在此行以上 -->)/, out + `$1` )
    let spipage = new bot.page( `Wikipedia:傀儡調查/案件/${ req.name }` )
    await spipage.edit( ( { content } ) => {
      return {
        text: content.replace( req.text, newtext ),
        summary: `機械助理提示（測試中，未正式投入使用）`,
        bot: true
      }
    } )
    console.log( newtext )
    console.log( `已自動檢查 Wikipedia:傀儡調查/案件/${ req.name } 的CU請求` )
  }
  return;
}