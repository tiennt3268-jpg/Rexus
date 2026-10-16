/* REXUS Document v2.0.6 — minimal dependency-free Open XML (.docx) exporter.
 * Creates a valid ZIP-based WordprocessingML package, not an HTML file renamed .docx.
 * No network or third-party runtime libraries; supports common formatting and embedded PNG/JPEG.
 */
(function(){'use strict';
 const TE=new TextEncoder();
 const utf=t=>TE.encode(String(t));
 const xml=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 function crc32(bytes){let c=-1;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let j=0;j<8;j++)c=c&1?(c>>>1)^0xEDB88320:c>>>1;}return(c^-1)>>>0;}
 const w16=(v,n,x)=>v.setUint16(n,x,true),w32=(v,n,x)=>v.setUint32(n,x,true);
 function zip(files){let parts=[],cent=[],offset=0,total=0;
  for(const [name,value] of Object.entries(files)){
   const fn=utf(name),data=value instanceof Uint8Array?value:utf(value),crc=crc32(data);
   const loc=new Uint8Array(30+fn.length),dv=new DataView(loc.buffer);
   w32(dv,0,0x04034b50);w16(dv,4,20);w16(dv,6,0x0800);w16(dv,8,0);w32(dv,14,crc);w32(dv,18,data.length);w32(dv,22,data.length);w16(dv,26,fn.length);loc.set(fn,30);parts.push(loc,data);
   const cen=new Uint8Array(46+fn.length),cv=new DataView(cen.buffer);
   w32(cv,0,0x02014b50);w16(cv,4,20);w16(cv,6,20);w16(cv,8,0x0800);w32(cv,16,crc);w32(cv,20,data.length);w32(cv,24,data.length);w16(cv,28,fn.length);w32(cv,42,offset);cen.set(fn,46);cent.push(cen);
   offset+=loc.length+data.length;total+=cen.length;
  }
  const end=new Uint8Array(22),edv=new DataView(end.buffer);w32(edv,0,0x06054b50);w16(edv,8,cent.length);w16(edv,10,cent.length);w32(edv,12,total);w32(edv,16,offset);
  return new Blob([...parts,...cent,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
 }
 async function download(title,html){
   const parser=new DOMParser().parseFromString('<div id="rexus-export">'+html+'</div>','text/html');
   const root=parser.getElementById('rexus-export');if(!root)throw Error('Missing document content');
   const rels=[],media={},mime=new Set(),body=[],numbering=[],nums=[];
   let rid=1,imageIndex=0,numberId=1;
   function rel(type,target,mode){const n='rId'+(++rid);rels.push('<Relationship Id="'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'+type+'" Target="'+xml(target)+'"'+(mode?' TargetMode="External"':'')+'/>');return n;}
   function run(text,style={}){
    if(!text)return '';
    const tags=[];if(style.bold)tags.push('<w:b/>');if(style.italic)tags.push('<w:i/>');if(style.underline)tags.push('<w:u w:val="single"/>');if(style.strike)tags.push('<w:strike/>');if(style.super)tags.push('<w:vertAlign w:val="superscript"/>');if(style.sub)tags.push('<w:vertAlign w:val="subscript"/>');if(style.font)tags.push('<w:rFonts w:ascii="'+xml(style.font)+'" w:hAnsi="'+xml(style.font)+'"/>');if(style.size)tags.push('<w:sz w:val="'+Math.round(style.size*2)+'"/>');
    return '<w:r>'+(tags.length?'<w:rPr>'+tags.join('')+'</w:rPr>':'')+'<w:t xml:space="preserve">'+xml(text)+'</w:t></w:r>';
   }
   async function image(node){
    const src=node.getAttribute('src')||'';
    if(!/^(https?:\/\/|\/api\/rexus-document-files\?file=)/.test(src))return run('[Image]');
    try{
      const r=await fetch(src,{credentials:'same-origin'});if(!r.ok)throw Error('Image not available');
      const contentType=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(!['image/png','image/jpeg'].includes(contentType))throw Error('Unsupported image');
      const ext=contentType==='image/png'?'png':'jpeg',file='image'+(++imageIndex)+'.'+ext;
      media['word/media/'+file]=new Uint8Array(await r.arrayBuffer());mime.add(ext);
      const link=rel('image','media/'+file,false),docPr=imageIndex,cx=4800000,cy=2700000;
      return '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+docPr+'" name="'+xml(file)+'"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="'+docPr+'" name="'+xml(file)+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+link+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }catch(e){return run('[Image: '+(node.getAttribute('alt')||'unavailable')+']');}
   }
   async function inline(node,style={}){
    if(node.nodeType===3)return run(node.nodeValue,style);
    if(node.nodeType!==1)return '';
    const tag=node.tagName.toLowerCase();
    if(tag==='img')return await image(node);
    if(tag==='br')return '<w:r><w:br/></w:r>';
    const st={...style};if(['strong','b'].includes(tag))st.bold=true;if(['em','i'].includes(tag))st.italic=true;if(tag==='u')st.underline=true;if(['s','del'].includes(tag))st.strike=true;if(tag==='sup')st.super=true;if(tag==='sub')st.sub=true;
    if(node.style.fontSize){const n=parseInt(node.style.fontSize);if(n>=8&&n<=60)st.size=n;}
    if(node.style.fontFamily)st.font=node.style.fontFamily.replace(/["']/g,'');
    let content='';for(const child of node.childNodes)content+=await inline(child,st);
    if(tag==='a' && node.getAttribute('href')){
      let href=node.getAttribute('href');if(href.startsWith('#document/'))href=location.origin+location.pathname+href;
      if(/^https?:\/\//i.test(href)){const r=rel('hyperlink',href,true);return '<w:hyperlink r:id="'+r+'">'+content+'</w:hyperlink>';}
    }
    return content;
   }
   async function paragraph(node,styleName,extra=''){
    let content='';for(const child of node.childNodes)content+=await inline(child);
    if(!content)content='<w:r><w:t> </w:t></w:r>';
    const props=(styleName?'<w:pStyle w:val="'+styleName+'"/>':'')+extra;
    return '<w:p>'+(props?'<w:pPr>'+props+'</w:pPr>':'')+content+'</w:p>';
   }
   async function table(node){let out='<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/><w:right w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders></w:tblPr>';
    for(const tr of node.querySelectorAll('tr')){out+='<w:tr>';for(const td of tr.children){if(!['TH','TD'].includes(td.tagName))continue;out+='<w:tc><w:tcPr><w:tcW w:type="auto" w:w="0"/>'+(td.colSpan>1?'<w:gridSpan w:val="'+td.colSpan+'"/>':'')+'</w:tcPr>'+await paragraph(td,td.tagName==='TH'?'Heading4':null)+'</w:tc>';}out+='</w:tr>';}
    return out+'</w:tbl>';
   }
   async function block(node){if(node.nodeType===3)return node.nodeValue.trim()?'<w:p>'+run(node.nodeValue)+'</w:p>':'';if(node.nodeType!==1)return '';
    const tag=node.tagName.toLowerCase();
    if(['h1','h2','h3','h4','h5','h6'].includes(tag))return await paragraph(node,'Heading'+tag[1]);
    if(tag==='table')return await table(node);
    if(tag==='nav')return '';
    if(tag==='img')return '<w:p>'+await image(node)+'</w:p>';
    if(tag==='p')return await paragraph(node);
    if(tag==='blockquote')return await paragraph(node,'Quote');
    if(tag==='pre')return await paragraph(node,'Code');
    if(tag==='hr')return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6"/></w:pBdr></w:pPr></w:p>';
    if(tag==='ul'||tag==='ol'){
      let out='',count=0;for(const li of node.children){if(li.tagName!=='LI')continue;count++;out+='<w:p>'+run(tag==='ol'?count+'. ':'• ')+await inline(li)+'</w:p>';}return out;
    }
    let out='';for(const child of node.childNodes)out+=await block(child);return out;
   }
   body.push('<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>'+run(title)+'</w:p>');
   for(const node of root.childNodes)body.push(await block(node));
   const doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>'+body.join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1250" w:bottom="1200" w:left="1250"/></w:sectPr></w:body></w:document>';
   const styles='<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>'+[1,2,3,4,5,6].map(n=>'<w:style w:type="paragraph" w:styleId="Heading'+n+'"><w:name w:val="heading '+n+'"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="'+(34-(n-1)*3)+'"/></w:rPr></w:style>').join('')+'</w:styles>';
   const types='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+[...mime].map(ext=>'<Default Extension="'+ext+'" ContentType="image/'+(ext==='jpeg'?'jpeg':'png')+'"/>').join('')+'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
   const files={
    '[Content_Types].xml':types,
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':doc,
    'word/styles.xml':styles,
    'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+rels.join('')+'</Relationships>',
    ...media
   };
   const blob=zip(files),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(title||'REXUS Document').replace(/[\\/:*?"<>|]/g,'_')+'.docx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 window.RexusDocxExport={download};
})();
