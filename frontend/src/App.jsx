import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Vau from './Vau';
import { StoreProvider } from './StoreContext';

const AppContent = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    const lang = i18n.language?.startsWith('ru') ? 'ru' : 'he';
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [i18n.language]);

  return <Vau />;
};

function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

export default App;
