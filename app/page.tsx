'use client';
import {useEffect} from 'react';

const destination = 'https://vasquezpalparoy-star.github.io/grafiplot-cuentas-claras/';
export default function Page(){
  useEffect(()=>{window.location.replace(destination)},[]);
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#101012',color:'#f5f5f5',fontFamily:'Arial,sans-serif',padding:'2rem',textAlign:'center'}}><div><h1 style={{fontSize:'1.6rem'}}>Grafiplot cambió de dirección</h1><p>Estamos abriendo la versión segura.</p><a href={destination} style={{color:'#ff3855'}}>Abrir Grafiplot</a></div></main>;
}
