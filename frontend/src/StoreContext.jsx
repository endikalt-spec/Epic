import { createContext, useContext, useState } from 'react';

const StoreContext = createContext();

export const StoreProvider = ({ children }) => {
  const [giftBox, setGiftBox] = useState([]);
  const [language, setLanguage] = useState('he');

  const addToGiftBox = (experience) => {
    if (giftBox.length < 5 && !giftBox.find(item => item.id === experience.id)) {
      setGiftBox([...giftBox, experience]);
    }
  };

  const removeFromGiftBox = (id) => {
    setGiftBox(giftBox.filter(item => item.id !== id));
  };

  const clearGiftBox = () => setGiftBox([]);

  return (
    <StoreContext.Provider value={{
      giftBox,
      addToGiftBox,
      removeFromGiftBox,
      clearGiftBox,
      language,
      setLanguage
    }}>
      {children}
    </StoreContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useStore = () => useContext(StoreContext);
