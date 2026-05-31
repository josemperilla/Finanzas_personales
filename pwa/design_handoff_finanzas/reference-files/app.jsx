// app.jsx — composes the Finanzas onboarding canvas.
const { useState } = React;

function Phone({ children, dark = false }) {
  return <IOSDevice width={402} height={874} dark={dark}>{children}</IOSDevice>;
}

const PHONE_STYLE = { background: 'transparent', boxShadow: 'none', overflow: 'visible', borderRadius: 48 };
const WEB_STYLE = { background: 'transparent', boxShadow: 'none', overflow: 'visible', borderRadius: 16 };

function App() {
  return (
    <DesignCanvas>
      <DCSection id="ios" title="iOS · Registro y onboarding" subtitle="Ocho pantallas — de la bienvenida a tu panel del mes.">
        <DCArtboard id="welcome" label="1 · Bienvenida" width={402} height={874} style={PHONE_STYLE}><Phone><S_Welcome /></Phone></DCArtboard>
        <DCArtboard id="signup" label="2 · Crear cuenta" width={402} height={874} style={PHONE_STYLE}><Phone><S_SignUp /></Phone></DCArtboard>
        <DCArtboard id="verify" label="3 · Verificación" width={402} height={874} style={PHONE_STYLE}><Phone><S_Verify /></Phone></DCArtboard>
        <DCArtboard id="profile" label="4 · Perfil y moneda" width={402} height={874} style={PHONE_STYLE}><Phone><S_Profile /></Phone></DCArtboard>
        <DCArtboard id="cards" label="5 · Agrega tarjetas" width={402} height={874} style={PHONE_STYLE}><Phone><S_Cards /></Phone></DCArtboard>
        <DCArtboard id="limit" label="6 · Límite mensual" width={402} height={874} style={PHONE_STYLE}><Phone><S_Limit /></Phone></DCArtboard>
        <DCArtboard id="notify" label="7 · Notificaciones" width={402} height={874} style={PHONE_STYLE}><Phone dark><S_Notify /></Phone></DCArtboard>
        <DCArtboard id="dashboard" label="8 · Panel del mes" width={402} height={874} style={PHONE_STYLE}><Phone><S_Dashboard /></Phone></DCArtboard>
      </DCSection>

      <DCSection id="web" title="Escritorio · Web" subtitle="Las pantallas clave, adaptadas a pantalla grande.">
        <DCArtboard id="landing" label="Landing" width={1240} height={800} style={WEB_STYLE}><D_Landing /></DCArtboard>
        <DCArtboard id="web-signup" label="Crear cuenta" width={1240} height={800} style={WEB_STYLE}><D_SignUp /></DCArtboard>
        <DCArtboard id="web-dashboard" label="Panel · Web app" width={1240} height={800} style={WEB_STYLE}><D_Dashboard /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
