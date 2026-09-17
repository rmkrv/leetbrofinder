package com.rmkrv.app.repository;

import com.rmkrv.app.domain.CoopSessionMessage;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;

public interface CoopSessionMessageRepository extends JpaRepository<CoopSessionMessage, UUID> {
    @EntityGraph(attributePaths = {"sender"})
    List<CoopSessionMessage> findBySessionIdOrderByCreatedAtAsc(UUID sessionId, Pageable pageable);
}
