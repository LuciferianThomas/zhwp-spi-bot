const { mwn } = require( 'mwn' ),
      moment = require( 'moment' )

const CronJob = require('cron').CronJob;

const { time, capitalize } = require( './fn' )

async function getClerkList( bot ) {
  console.log( "正在獲取調查助理列表" )
  let clerks = []

  let SPIC = new bot.page( 'Wikipedia:傀儡調查/調查助理' )
  
  let lines = ( await SPIC.text() ).split( /\n/g )
  // console.log( lines ) 
  let aCS = lines.indexOf( lines.find( x => /活躍調查助理/.test( x ) ) )   // active clerk section index
    , iCS = lines.indexOf( lines.find( x => /不活躍調查助理/.test( x ) ) ) // inactive clerk section index

  let p = /\{\{\/ClerkUser\|([^}]+)}}/

  for ( i = aCS + 1; i < iCS; i++ ) {
    let line = lines[i]
    if ( p.test( line ) ) {
      clerks.push( line.match( p )[1] )
    }
  }
  console.log( clerks )
  return clerks
}

async function getCUList( bot ) {
  console.log( "正在獲取用戶查核員列表" )

  let res = await bot.query( {
    list: "allusers",
    augroup: "checkuser",
    aulimit: 100
  } )

  let checkusers = res.query.allusers.length ? res.query.allusers.map(x => x.name) : []
  console.log( checkusers )
  return checkusers
}

/** @deprecated */
async function getStatusFromCat( categories ) {
  console.log( "正在獲取案件狀態" )
  const cat2status = {
    // 'SPI cases currently being checked': 'inprogress',
    '傀儡調查－等候進行查核': 'endorsed',
    '傀儡調查－社群共識轉交查核': 'condefer',
    '傀儡調查－重新提出查核': 'relist',
    '傀儡調查－等候查核檢查': 'CUrequest',
    '傀儡調查－請求管理員協助': 'admin',
    '傀儡調查－請求調查助理協助': 'clerk',
    '傀儡調查－完成用戶查核': 'checked',
    '傀儡調查－待處理': 'open',
    '傀儡調查－用戶查核員拒絕查核請求': 'cudeclined',
    '傀儡調查－調查助理拒絕查核請求': 'declined',
    '傀儡調查－需要更多資訊': 'moreinfo',
    // 'SPI cases on hold by checkuser': 'cuhold',
    '傀儡調查－調查助理擱置': 'hold',
    '傀儡調查－等候存檔': 'close',
  }

  let statuses = []
  for ( cat of categories ) {
    let title = cat.category

    if ( title in cat2status ) {
      statuses.push( cat2status[ title ] )
    }
  }

  let result = []
    , curequest_only = []
    , misc_only = []
  
  const priority = [ 'clerk', 'admin', 'checked', 'close' ]
      , curequest = { 'inprogress': 0, 'relist': 1, 'condefer': 1.5, 'endorsed': 2, 'CUrequest': 3 }
      , misc = {
        'open': 0, 'cudeclined': 1,
        'declined': 2, 'moreinfo': 3, 
        /* 'cuhold': 4, */ 'hold': 5}
  
  for ( status of statuses ) {
    if ( priority.includes( status ) ) {
      result.push( status )
    }
    else if ( status in curequest ) {
      curequest_only.push( status )
    }
    else if ( status in misc ) {
      misc_only.push( status )
    }
  }
      
  if ( curequest_only.length ) {
    result.push( curequest_only.sort( ( a, b ) => {
      curequest[ a ] - curequest[ b ]
    } )[ 0 ] )
  }
  if ( misc_only.length && ( result.length == 0 || ( result.length == 1 && result[ 0 ] == 'close' ) ) ) {
    result.push( misc_only.sort( ( a, b ) => {
      misc[ a ] - misc[ b ]
    } )[ 0 ] )
  }
  return result
}

function getStatusFromTemplate( wt ) {
  let caseStatusTemplate = wt.match( /\{\{SPI[ _]case[ _]status ?\| ?(.*?) ?\}\}/ )
  if ( !caseStatusTemplate || !caseStatusTemplate[1] ) return "未能辨識狀態";
  else return caseStatusTemplate[1];
}

async function getCaseDetails( bot, title, clerks ) {
  let page = new bot.page( `${ title }` )
  console.log( `正在獲取 ${ title } 的案件資訊` )
  let wikitext = await page.text()

  let cases_wt = wikitext.match( /=== ?\d{4}年\d{1,2}月\d{1,2}日 ?===(?:.|\n)+?----<!--+ 所有留言請放在此行以上 -->/g )
  let cases = [];

  for ( const case_wt of cases_wt ) {
    let _case = {
      name: title.split(/\//g)[2],
      status: getStatusFromTemplate( case_wt ),
      text: case_wt
    }

    console.log( "　　正在找出最後留言之用戶" )

    let p = /\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? (\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)/i
  
    let signatures = ( _case.text.match( new RegExp( p.source, p.flags + "g" ) ) || [] ).map( sig => {
      // console.log( sig.match( p ) )
      let [ _, user, year, month, day, hour, min ] = sig.match( p )
      // user = user.split(/\//g)[0]
      if ( month.length == 1 ) month = "0" + month
      if (   day.length == 1 )   day = "0" + day
      return {
        user: capitalize( user ),
        timestamp: new Date( `${ year }-${ month }-${ day }T${ hour }:${ min }:00+00:00` )
      }
    } )
    
    _case.last_comment = signatures.filter( sig => {
      return !clerks.includes( sig.user )
    } ).sort( ( a, b ) => {
      return b.timestamp - a.timestamp
    } )[0];
  
    _case.last_clerk = signatures.filter( sig => {
      return clerks.includes( sig.user )
    } ).sort( ( a, b ) => {
      return b.timestamp - a.timestamp
    } )[0];
  
    _case.file_time = signatures.sort( ( a, b ) => {
      return a.timestamp - b.timestamp
    } )[0].timestamp
  
    console.log( `　　案件：${ _case.name }\n　　狀態：${ _case.status }\n　　登錄時間：${ time( _case.file_time ) }\n　　最後留言：${ _case.last_comment ? `${ _case.last_comment.user } 於 ${ time( _case.last_comment.timestamp ) }` : `無` }\n　　最後助理留言：${ _case.last_clerk ? `${ _case.last_clerk.user } 於 ${ time( _case.last_clerk.timestamp ) }` : `無` }` )
    cases.push( _case )
  }
  return cases 
}

function sortCases( cases ) {
  const rank = {
    'INPROGRESS': 0,
    'ENDORSE': 1, 'ENDORSED': 1,
    'CONDEFER': 1.5,
    'RELIST': 2, 'RELISTED': 2,
    'QUICK': 3,
    'CU': 4, 'CUREQUEST': 4, 'CHECKUSER': 4, 'REQUEST': 4,
    'ADMIN': 5, 'ADMINISTRATOR': 5,
    'CLERK': 6,
    'CHECKED': 7, 'COMPLETED': 7,
    'OPEN': 8,
    'CUDECLINE': 9, 'CUDECLINED': 9,
    'DECLINE': 10, 'DECLINED': 10,
    'MOREINFO': 11, 'CUMOREINFO': 11,
    'CUHOLD': 12, 'HOLD': 13,
    'CLOSE': 14, 'CLOSED': 14
  }
  return cases.sort( ( a, b ) => {
    return rank[ a.status.toUpperCase() ] - rank[ b.status.toUpperCase() ]
  } )
}

async function getAllCases( bot, clerks ) {
  let cat = await bot.getPagesInCategory( 'Category:傀儡調查－進行中' )
  console.log( cat )
  let cases = []
  for ( page of cat ) {
    let page_cases = await getCaseDetails( bot, page, clerks )
    cases.push( ...page_cases.filter( _case => _case.status != '未能辨識狀態' ) )
  }
  // cases.push( ...get_cu_needed_templates() )
  return sortCases( cases )
}

function formatTableRow( _case ) {
  return `{{SPIstatusentry|1=${ _case.name
    }|2=${ _case.status
    }|3=${ _case.file_time ? time( _case.file_time ) : "未知"
    }|4=${ _case.last_comment ? _case.last_comment.user.replace( /^(([0-9A-F]{1,4})\:.*\:([^:]+\:[^:]+))$/i, `<abbr title="$1">$2...$3</abbr>` ) : ""
    }|5=${ _case.last_comment ? time( _case.last_comment.timestamp ) : ""
    }|6=${ _case.last_clerk ? _case.last_clerk.user.replace( /^(([0-9A-F]{1,4})\:.*\:([^:]+\:[^:]+))$/i, `<abbr title="$1">$2...$3</abbr>` ) : ""
    }|7=${ _case.last_clerk ? time( _case.last_clerk.timestamp ) : "" }}}\n`
}

function generateCaseTable( cases ) {
  let result = "{{SPIstatusheader}}\n"
  for ( _case of cases ) {
    result += formatTableRow( _case )
  }
  if ( cases.length == 0 ) {
    result += "| colspan=7 align=center style=\"font-size:150%;font-weight:bold\" | 暫無活躍傀儡調查案件"
  }
  result += "|}"
  return result
}

let lastDone;

module.exports = async ( bot ) => {
  const TABLE_LOCATION = 'Wikipedia:傀儡調查/案件'

  const main = async () => {
    let clerks = await getClerkList( bot )
    let checkusers = await getCUList( bot )
    clerks.push( ...checkusers )
    // console.log( clerks )
    let cases = await getAllCases( bot, clerks )
    let newCUreq = cases.filter( _case => {
      // if ([ "CUREQUEST", "CU", "REQUEST", "CHECKUSER" ].includes( _case.status.toUpperCase() )) console.log( _case.name, moment( _case.file_time ), moment( lastDone ).startOf('minute') )
      return [ "CUREQUEST", "CU", "REQUEST", "CHECKUSER" ].includes( _case.status.toUpperCase() ) && moment( _case.file_time ).isSameOrAfter( moment( lastDone ).startOf('minute') )
    } )
    let list = new bot.page( TABLE_LOCATION )
    await list.edit( ( { content } ) => {
      return {
        text: generateCaseTable( cases ),
        summary: `更新SPI案件列表（${ cases.length }活躍提報）`,
        bot: true
      }
    } )
    console.log( `已完成更新SPI案件列表（${ cases.length }活躍提報）` )
    lastDone = new moment();
    await require( './botclerk/stale_cu' )( bot, newCUreq.filter( x => x.name == "Example" ) )
    return;
  }

  var job = new CronJob('0 */10 * * * *', main, null, true);
  job.start();
  // main()
}