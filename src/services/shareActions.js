export function copyText(text) {
  const previous=document.activeElement,box=document.createElement('textarea')
  box.value=text;box.setAttribute('readonly','');box.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px'
  document.body.append(box);box.focus();box.select()
  let copied=false
  try{copied=document.execCommand('copy')}catch{}
  finally{box.remove();previous?.focus?.({preventScroll:true})}
  return copied
}
export function openTeams(config){if(config?.teamsUrl)window.open(config.teamsUrl,'_blank','noopener,noreferrer')}
